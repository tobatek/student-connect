//! SeaORM entity. Skema didefinisikan oleh migration; jangan kirim langsung ke klien (gunakan `views`).

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "tenants")]
pub struct Model {
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    #[sea_orm(primary_key)]
    pub id: i64,
    pub pid: Uuid,
    #[sea_orm(unique)]
    pub slug: String,
    pub nama_pt: String,
    pub kode_pt: String,
    pub tahun_aktif: i32,
    pub allow_kab_rekognisi: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}
