//! SeaORM entity. Skema didefinisikan oleh migration; jangan kirim langsung ke klien (gunakan `views`).

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "audit_logs")]
pub struct Model {
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    #[sea_orm(primary_key)]
    pub id: i64,
    pub tenant_id: Option<i64>,
    pub actor_id: Option<i64>,
    pub actor_email: Option<String>,
    pub actor_role: Option<String>,
    pub action: String,
    pub entity: String,
    pub entity_ref: Option<String>,
    pub outcome: String,
    pub ip: Option<String>,
    pub request_id: Option<String>,
    pub detail: Json,
    pub prev_hash: String,
    pub hash: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}
