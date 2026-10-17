//! SeaORM entity. Skema didefinisikan oleh migration; jangan kirim langsung ke klien (gunakan `views`).

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "simkatmawa_credentials")]
pub struct Model {
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    #[sea_orm(primary_key)]
    pub id: i64,
    #[sea_orm(unique)]
    pub tenant_id: i64,
    pub api_url: String,
    pub email: String,
    pub enc_password: String,
    pub enc_token: Option<String>,
    pub token_expires_at: Option<DateTimeWithTimeZone>,
    pub is_connected: bool,
    pub last_checked_at: Option<DateTimeWithTimeZone>,
    pub last_error: Option<String>,
    pub key_version: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}
