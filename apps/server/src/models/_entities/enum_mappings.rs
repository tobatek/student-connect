//! SeaORM entity. Skema didefinisikan oleh migration; jangan kirim langsung ke klien (gunakan `views`).

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "enum_mappings")]
pub struct Model {
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    #[sea_orm(primary_key)]
    pub id: i64,
    pub tenant_id: i64,
    pub group_name: String,
    pub internal_value: String,
    pub simkatmawa_code: String,
    pub label: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}
