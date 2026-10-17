//! SeaORM entity. Skema didefinisikan oleh migration; jangan kirim langsung ke klien (gunakan `views`).

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "kejuaraan")]
pub struct Model {
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    #[sea_orm(primary_key)]
    pub id: i64,
    pub pid: Uuid,
    pub tenant_id: i64,
    pub nama_ajang: String,
    pub jenis_penyelenggaraan: String,
    pub level: String,
    pub kategori: String,
    pub bentuk: String,
    pub tempat: String,
    pub url_ajang: String,
    pub tahun: i32,
    pub laporan: Json,
    pub created_by: Option<i64>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}
