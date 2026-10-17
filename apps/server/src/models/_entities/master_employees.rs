//! SeaORM entity. Skema didefinisikan oleh migration; jangan kirim langsung ke klien (gunakan `views`).

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "master_employees")]
pub struct Model {
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    #[sea_orm(primary_key)]
    pub id: i64,
    pub tenant_id: i64,
    pub nip: String,
    pub full_name: String,
    pub email: Option<String>,
    pub work_unit: Option<String>,
    pub position: Option<String>,
    pub nuptk: Option<String>,
    pub is_active: bool,
    pub source_hash: String,
    pub source_updated_at: Option<DateTimeWithTimeZone>,
    pub last_seen_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}
