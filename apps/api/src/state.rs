use crate::models::document::Document;
use crate::models::record::{Record, RecordKind};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug)]
pub struct AppState {
    next_id: AtomicU64,
    tenant: Mutex<Option<Value>>,
    records: Mutex<HashMap<RecordKind, Vec<Record>>>,
    documents: Mutex<Vec<Document>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            tenant: Mutex::new(None),
            records: Mutex::new(HashMap::new()),
            documents: Mutex::new(Vec::new()),
        }
    }
}

impl AppState {
    pub fn current_tenant(&self) -> Option<Value> {
        self.tenant.lock().expect("tenant mutex poisoned").clone()
    }

    pub fn replace_tenant(&self, tenant: Value) -> Value {
        let mut current = self.tenant.lock().expect("tenant mutex poisoned");
        *current = Some(tenant.clone());
        tenant
    }

    pub fn create_record(&self, kind: RecordKind, tenant_id: String, data: Value) -> Record {
        let record = Record {
            id: format!(
                "{}-{}",
                kind.id_prefix(),
                self.next_id.fetch_add(1, Ordering::SeqCst)
            ),
            tenant_id,
            data,
            created_at: now_epoch_seconds(),
            updated_at: now_epoch_seconds(),
        };
        self.records
            .lock()
            .expect("records mutex poisoned")
            .entry(kind)
            .or_default()
            .push(record.clone());
        record
    }

    pub fn update_record(&self, kind: RecordKind, id: &str, data: Value) -> Option<Record> {
        let mut records = self.records.lock().expect("records mutex poisoned");
        let collection = records.entry(kind).or_default();
        let record = collection.iter_mut().find(|record| record.id == id)?;

        record.data = data;
        record.updated_at = now_epoch_seconds();
        Some(record.clone())
    }

    pub fn get_record(&self, kind: RecordKind, id: &str) -> Option<Record> {
        self.records
            .lock()
            .expect("records mutex poisoned")
            .get(&kind)
            .and_then(|records| records.iter().find(|record| record.id == id).cloned())
    }

    pub fn list_records(&self, kind: RecordKind, page: u64, limit: u64) -> (Vec<Record>, u64) {
        let records = self.records.lock().expect("records mutex poisoned");
        let collection = records.get(&kind).cloned().unwrap_or_default();
        let total = collection.len() as u64;
        let offset = ((page - 1) * limit) as usize;
        let items = collection
            .into_iter()
            .skip(offset)
            .take(limit as usize)
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

    pub fn list_documents(&self, page: u64, limit: u64) -> (Vec<Document>, u64) {
        let documents = self.documents.lock().expect("documents mutex poisoned");
        let total = documents.len() as u64;
        let offset = ((page - 1) * limit) as usize;
        let items = documents
            .iter()
            .skip(offset)
            .take(limit as usize)
            .cloned()
            .collect();

        (items, total)
    }

    pub fn get_document(&self, id: &str) -> Option<Document> {
        self.documents
            .lock()
            .expect("documents mutex poisoned")
            .iter()
            .find(|document| document.id == id)
            .cloned()
    }

    pub fn delete_document(&self, id: &str) -> Result<Document, String> {
        let mut documents = self.documents.lock().expect("documents mutex poisoned");
        let Some(index) = documents.iter().position(|document| document.id == id) else {
            return Err("document not found".to_string());
        };
        if documents[index].is_locked {
            return Err("locked document cannot be deleted".to_string());
        }

        Ok(documents.remove(index))
    }
}

fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
