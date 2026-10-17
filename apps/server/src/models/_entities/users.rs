//! SeaORM entity. Skema didefinisikan oleh migration; jangan kirim langsung ke klien (gunakan `views`).

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "users")]
pub struct Model {
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    #[sea_orm(primary_key)]
    pub id: i64,
    pub pid: Uuid,
    pub tenant_id: i64,
    pub email: String,
    pub password: String,
    pub name: String,
    pub role: String,
    pub is_active: bool,
    pub failed_login_attempts: i32,
    pub locked_until: Option<DateTimeWithTimeZone>,
    pub last_login_at: Option<DateTimeWithTimeZone>,
    pub password_changed_at: DateTimeWithTimeZone,
    pub must_change_password: bool,
    pub portal_user_id: Option<Uuid>,
    pub nim: Option<String>,
    pub auth_source: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}
