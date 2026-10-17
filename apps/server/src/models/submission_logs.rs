//! Log setiap percobaan pengiriman ke SIMKATMAWA. Ringkasan request/response disensor.

use loco_rs::prelude::*;
use serde_json::Value;

pub use super::_entities::submission_logs::{self, ActiveModel, Column, Entity, Model};
use crate::security::mask;

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

pub struct NewLog {
    pub tenant_id: i64,
    pub record_id: i64,
    pub kind: String,
    pub attempt: i32,
    pub outcome: &'static str,
    pub http_status: Option<i32>,
    pub request_summary: Value,
    pub response_summary: Value,
    pub error: Option<String>,
    pub idempotency_key: Uuid,
}

impl Model {
    /// # Errors
    /// Galat database.
    pub async fn append(db: &DatabaseConnection, log: NewLog) -> ModelResult<Self> {
        Ok(ActiveModel {
            pid: ActiveValue::set(Uuid::new_v4()),
            tenant_id: ActiveValue::set(log.tenant_id),
            record_id: ActiveValue::set(log.record_id),
            kind: ActiveValue::set(log.kind),
            attempt: ActiveValue::set(log.attempt),
            outcome: ActiveValue::set(log.outcome.to_string()),
            http_status: ActiveValue::set(log.http_status),
            request_summary: ActiveValue::set(mask::mask(&log.request_summary)),
            response_summary: ActiveValue::set(mask::mask(&log.response_summary)),
            error: ActiveValue::set(log.error.map(|e| e.chars().take(500).collect())),
            idempotency_key: ActiveValue::set(log.idempotency_key),
            ..Default::default()
        }
        .insert(db)
        .await?)
    }

    /// # Errors
    /// Galat database.
    pub async fn page(db: &DatabaseConnection, tenant_id: i64, page: u64, page_size: u64) -> ModelResult<(Vec<Self>, u64)> {
        let paginator = Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .order_by_desc(Column::Id)
            .paginate(db, page_size);
        let total = paginator.num_items().await?;
        Ok((paginator.fetch_page(page.saturating_sub(1)).await?, total))
    }
}
