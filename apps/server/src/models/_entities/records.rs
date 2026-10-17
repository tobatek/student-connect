//! SeaORM entity. Skema didefinisikan oleh migration; jangan kirim langsung ke klien (gunakan `views`).

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "records")]
pub struct Model {
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    #[sea_orm(primary_key)]
    pub id: i64,
    pub pid: Uuid,
    pub tenant_id: i64,
    pub kind: String,
    pub status: String,
    pub nama: String,
    pub level: String,
    pub penyelenggara: String,
    pub url_peserta: String,
    pub url_sertifikat: String,
    pub tgl_sertifikat: Date,
    pub url_foto_upp: Option<String>,
    pub url_dokumen_undangan: Option<String>,
    pub keterangan: Option<String>,
    pub mahasiswa: Json,
    pub dosen: Json,
    pub extra: Json,
    pub simkatmawa_id: Option<String>,
    pub simkatmawa_kode_pt: Option<String>,
    pub simkatmawa_tahun: Option<String>,
    pub sent_at: Option<DateTimeWithTimeZone>,
    pub last_error: Option<String>,
    pub submission_attempts: i32,
    pub idempotency_key: Uuid,
    pub revision_note: Option<String>,
    pub version: i32,
    pub created_by: Option<i64>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}
