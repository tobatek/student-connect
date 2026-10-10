use crate::models::document::Document;
use crate::models::record::{Record, RecordKind};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Eq, PartialEq)]
pub enum UpdateError {
    NotFound,
    Locked,
}

#[derive(Debug, Eq, PartialEq)]
pub enum DeleteError {
    NotFound,
    Locked,
}

/// In-memory baseline store. Every accessor is scoped by `tenant_id`.
#[derive(Debug)]
pub struct AppState {
    next_id: AtomicU64,
    tenants: Mutex<HashMap<String, Value>>,
    records: Mutex<HashMap<RecordKind, Vec<Record>>>,
    documents: Mutex<Vec<Document>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            tenants: Mutex::new(HashMap::new()),
            records: Mutex::new(HashMap::new()),
            documents: Mutex::new(Vec::new()),
        }
    }
}

impl AppState {
    pub fn current_tenant(&self, tenant_id: &str) -> Option<Value> {
        self.tenants
            .lock()
            .expect("tenants mutex poisoned")
            .get(tenant_id)
            .cloned()
    }

    pub fn replace_tenant(&self, tenant_id: &str, tenant: Value) -> Value {
        self.tenants
            .lock()
            .expect("tenants mutex poisoned")
            .insert(tenant_id.to_string(), tenant.clone());
        tenant
    }

    pub fn create_record(
        &self,
        kind: RecordKind,
        tenant_id: &str,
        created_by: &str,
        data: Value,
    ) -> Record {
        let now = now_epoch_seconds();
        let record = Record {
            id: self.next_record_id(kind),
            tenant_id: tenant_id.to_string(),
            status: initial_status(kind).to_string(),
            created_by: created_by.to_string(),
            data,
            created_at: now,
            updated_at: now,
        };
        self.records
            .lock()
            .expect("records mutex poisoned")
            .entry(kind)
            .or_default()
            .push(record.clone());
        record
    }

    pub fn update_record(
        &self,
        kind: RecordKind,
        tenant_id: &str,
        id: &str,
        data: Value,
    ) -> Result<Record, UpdateError> {
        let mut records = self.records.lock().expect("records mutex poisoned");
        let record = records
            .entry(kind)
            .or_default()
            .iter_mut()
            .find(|record| record.id == id && record.tenant_id == tenant_id)
            .ok_or(UpdateError::NotFound)?;
        if record.is_locked() {
            return Err(UpdateError::Locked);
        }

        record.data = data;
        record.updated_at = now_epoch_seconds();
        Ok(record.clone())
    }

    /// Replaces the mapping with the same `(category, internal_code)`, or creates it.
    /// Returns the record and whether it was newly created.
    pub fn upsert_enum_mapping(
        &self,
        tenant_id: &str,
        updated_by: &str,
        data: Value,
    ) -> (Record, bool) {
        let identity = |value: &Value| {
            (
                value.get("category").cloned(),
                value.get("internal_code").cloned(),
            )
        };
        let mut records = self.records.lock().expect("records mutex poisoned");
        let collection = records.entry(RecordKind::EnumMapping).or_default();
        let now = now_epoch_seconds();

        if let Some(existing) = collection.iter_mut().find(|record| {
            record.tenant_id == tenant_id && identity(&record.data) == identity(&data)
        }) {
            existing.data = data;
            existing.updated_at = now;
            return (existing.clone(), false);
        }

        let record = Record {
            id: self.next_record_id(RecordKind::EnumMapping),
            tenant_id: tenant_id.to_string(),
            status: initial_status(RecordKind::EnumMapping).to_string(),
            created_by: updated_by.to_string(),
            data,
            created_at: now,
            updated_at: now,
        };
        collection.push(record.clone());
        (record, true)
    }

    pub fn get_record(&self, kind: RecordKind, tenant_id: &str, id: &str) -> Option<Record> {
        self.records
            .lock()
            .expect("records mutex poisoned")
            .get(&kind)
            .and_then(|records| {
                records
                    .iter()
                    .find(|record| record.id == id && record.tenant_id == tenant_id)
                    .cloned()
            })
    }

    pub fn list_records(
        &self,
        kind: RecordKind,
        tenant_id: &str,
        page: u64,
        limit: u64,
    ) -> (Vec<Record>, u64) {
        let records = self.records.lock().expect("records mutex poisoned");
        let Some(collection) = records.get(&kind) else {
            return (Vec::new(), 0);
        };
        let scoped = || {
            collection
                .iter()
                .filter(|record| record.tenant_id == tenant_id)
        };
        let total = scoped().count() as u64;
        let items = scoped()
            .skip(((page - 1) * limit) as usize)
            .take(limit as usize)
            .cloned()
            .collect();

        (items, total)
    }

    pub fn create_document(&self, document: Document) -> Document {
        self.documents
            .lock()
            .expect("documents mutex poisoned")
            .push(document.clone());
        document
    }

    pub fn list_documents(&self, tenant_id: &str, page: u64, limit: u64) -> (Vec<Document>, u64) {
        let documents = self.documents.lock().expect("documents mutex poisoned");
        let scoped = || {
            documents
                .iter()
                .filter(|document| document.tenant_id == tenant_id)
        };
        let total = scoped().count() as u64;
        let items = scoped()
            .skip(((page - 1) * limit) as usize)
            .take(limit as usize)
            .cloned()
            .collect();

        (items, total)
    }

    pub fn get_document(&self, tenant_id: &str, id: &str) -> Option<Document> {
        self.documents
            .lock()
            .expect("documents mutex poisoned")
            .iter()
            .find(|document| document.id == id && document.tenant_id == tenant_id)
            .cloned()
    }

    pub fn delete_document(&self, tenant_id: &str, id: &str) -> Result<Document, DeleteError> {
        let mut documents = self.documents.lock().expect("documents mutex poisoned");
        let Some(index) = documents
            .iter()
            .position(|document| document.id == id && document.tenant_id == tenant_id)
        else {
            return Err(DeleteError::NotFound);
        };
        if documents[index].is_locked {
            return Err(DeleteError::Locked);
        }

        Ok(documents.remove(index))
    }

    fn next_record_id(&self, kind: RecordKind) -> String {
        format!(
            "{}-{}",
            kind.id_prefix(),
            self.next_id.fetch_add(1, Ordering::SeqCst)
        )
    }
}

fn initial_status(kind: RecordKind) -> &'static str {
    match kind {
        RecordKind::EnumMapping => "",
        _ => "DRAFT",
    }
}

fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
