//! SeaORM entity. Skema didefinisikan oleh migration; jangan kirim langsung ke klien (gunakan `views`).

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "submission_logs")]
pub struct Model {
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    #[sea_orm(primary_key)]
    pub id: i64,
    pub pid: Uuid,
    pub tenant_id: i64,
    pub record_id: i64,
    pub kind: String,
    pub attempt: i32,
    pub outcome: String,
    pub http_status: Option<i32>,
    pub request_summary: Json,
    pub response_summary: Json,
    pub error: Option<String>,
    pub idempotency_key: Uuid,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}
