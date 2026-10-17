//! Audit log tamper-evident (ISO/IEC 27001:2022 A.8.15). Tabel append-only (trigger database)
//! dan setiap baris membawa hash berantai terhadap baris sebelumnya.

use chrono::{DateTime, Utc};
use loco_rs::prelude::*;
use serde_json::Value;
use sha2::{Digest, Sha256};

pub use super::_entities::audit_logs::{self, ActiveModel, Column, Entity, Model};
use crate::security::mask;

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

const GENESIS: &str = "0000000000000000000000000000000000000000000000000000000000000000";
const CHAIN_LOCK_KEY: i64 = 727_001;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Success,
    Denied,
    Failure,
}

impl Outcome {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Success => "SUCCESS",
            Self::Denied => "DENIED",
            Self::Failure => "FAILURE",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Actor {
    pub id: i64,
    pub email: String,
    pub role: String,
}

pub struct Entry<'a> {
    pub tenant_id: Option<i64>,
    pub actor: Option<Actor>,
    pub action: &'a str,
    pub entity: &'a str,
    pub entity_ref: Option<String>,
    pub outcome: Outcome,
    pub ip: Option<String>,
    pub request_id: Option<String>,
    pub detail: Value,
}

/// Serialisasi kanonik (kunci terurut) agar hash stabil setelah round-trip JSONB.
fn canonical(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let inner: Vec<String> = keys
                .into_iter()
                .map(|k| format!("{}:{}", serde_json::to_string(k).unwrap_or_default(), canonical(&map[k])))
                .collect();
            format!("{{{}}}", inner.join(","))
        }
        Value::Array(items) => format!("[{}]", items.iter().map(canonical).collect::<Vec<_>>().join(",")),
        other => other.to_string(),
    }
}

fn compute_hash(prev: &str, row: &Model) -> String {
    let material = format!(
        "{prev}|{}|{:?}|{:?}|{}|{}|{:?}|{}|{}",
        row.created_at.timestamp_micros(),
        row.tenant_id,
        row.actor_id,
        row.action,
        row.entity,
        row.entity_ref,
        row.outcome,
        canonical(&row.detail),
    );
    Sha256::digest(material.as_bytes())
        .iter()
        .fold(String::with_capacity(64), |mut acc, b| {
            use std::fmt::Write;
            let _ = write!(acc, "{b:02x}");
            acc
        })
}

#[derive(Debug, serde::Serialize)]
pub struct ChainReport {
    pub checked: u64,
    pub intact: bool,
    pub first_broken_id: Option<i64>,
}

impl Model {
    /// Menulis satu entri audit. Detail disensor otomatis. Gagal-tertutup: pemanggil
    /// harus menyebarkan galat sehingga aksi sensitif tidak lolos tanpa jejak.
    ///
    /// # Errors
    /// Galat database.
    pub async fn record(db: &DatabaseConnection, entry: Entry<'_>) -> ModelResult<Self> {
        let txn = db.begin().await?;
        // Serialisasi penulisan rantai antar-proses.
        txn.execute_unprepared(&format!("SELECT pg_advisory_xact_lock({CHAIN_LOCK_KEY})"))
            .await?;
        let prev = Entity::find()
            .order_by_desc(Column::Id)
            .one(&txn)
            .await?
            .map_or_else(|| GENESIS.to_string(), |m| m.hash);

        let micros = Utc::now().timestamp_micros();
        let now: DateTime<Utc> = DateTime::from_timestamp_micros(micros).unwrap_or_else(Utc::now);
        let mut row = Model {
            created_at: now.fixed_offset(),
            updated_at: now.fixed_offset(),
            id: 0,
            tenant_id: entry.tenant_id,
            actor_id: entry.actor.as_ref().map(|a| a.id),
            actor_email: entry.actor.as_ref().map(|a| a.email.clone()),
            actor_role: entry.actor.as_ref().map(|a| a.role.clone()),
            action: entry.action.to_string(),
            entity: entry.entity.to_string(),
            entity_ref: entry.entity_ref,
            outcome: entry.outcome.as_str().to_string(),
            ip: entry.ip,
            request_id: entry.request_id,
            detail: mask::mask(&entry.detail),
            prev_hash: prev.clone(),
            hash: String::new(),
        };
        row.hash = compute_hash(&prev, &row);

        let saved = ActiveModel {
            created_at: ActiveValue::set(row.created_at),
            updated_at: ActiveValue::set(row.updated_at),
            tenant_id: ActiveValue::set(row.tenant_id),
            actor_id: ActiveValue::set(row.actor_id),
            actor_email: ActiveValue::set(row.actor_email),
            actor_role: ActiveValue::set(row.actor_role),
            action: ActiveValue::set(row.action),
            entity: ActiveValue::set(row.entity),
            entity_ref: ActiveValue::set(row.entity_ref),
            outcome: ActiveValue::set(row.outcome),
            ip: ActiveValue::set(row.ip),
            request_id: ActiveValue::set(row.request_id),
            detail: ActiveValue::set(row.detail),
            prev_hash: ActiveValue::set(row.prev_hash),
            hash: ActiveValue::set(row.hash),
            ..Default::default()
        }
        .insert(&txn)
        .await?;
        txn.commit().await?;
        Ok(saved)
    }

    /// Memverifikasi seluruh rantai hash.
    ///
    /// # Errors
    /// Galat database.
    pub async fn verify_chain(db: &DatabaseConnection) -> ModelResult<ChainReport> {
        let mut prev = GENESIS.to_string();
        let mut checked = 0_u64;
        let mut paginator = Entity::find().order_by_asc(Column::Id).paginate(db, 1000);
        while let Some(batch) = paginator.fetch_and_next().await? {
            for row in batch {
                if row.prev_hash != prev || compute_hash(&prev, &row) != row.hash {
                    return Ok(ChainReport { checked, intact: false, first_broken_id: Some(row.id) });
                }
                prev = row.hash.clone();
                checked += 1;
            }
        }
        Ok(ChainReport { checked, intact: true, first_broken_id: None })
    }

    /// # Errors
    /// Galat database.
    pub async fn page(
        db: &DatabaseConnection,
        tenant_id: i64,
        page: u64,
        page_size: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let paginator = Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .order_by_desc(Column::Id)
            .paginate(db, page_size);
        let total = paginator.num_items().await?;
        let items = paginator.fetch_page(page.saturating_sub(1)).await?;
        Ok((items, total))
    }
}

#[cfg(test)]
mod tests {
    use super::canonical;
    use serde_json::json;

    #[test]
    fn canonical_is_key_order_independent() {
        let a = json!({"b": 1, "a": {"y": [1, 2], "x": "z"}});
        let b = json!({"a": {"x": "z", "y": [1, 2]}, "b": 1});
        assert_eq!(canonical(&a), canonical(&b));
    }
}
