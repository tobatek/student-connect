//! Pemetaan nilai internal -> kode SIMKATMAWA (panduan §4 butir 2). Nilai bawaan ada di kode;
//! tenant dapat menimpanya bila kode SIMKATMAWA berubah.

use loco_rs::prelude::*;
use serde::Deserialize;

pub use super::_entities::enum_mappings::{self, ActiveModel, Column, Entity, Model};
use crate::errors::FieldErrors;

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

pub const GROUPS: [&str; 6] = ["level", "kategori", "peringkat", "kelompok_prestasi", "bentuk", "jenis"];

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MappingIn {
    pub group_name: String,
    pub internal_value: String,
    pub simkatmawa_code: String,
    pub label: String,
}

impl MappingIn {
    /// # Errors
    /// Galat per-field.
    pub fn validate(&self) -> std::result::Result<(), FieldErrors> {
        let mut e = FieldErrors::default();
        if !GROUPS.contains(&self.group_name.as_str()) {
            e.add("group_name", "Grup tidak dikenal.");
        }
        let code_ok = |s: &str| (1..=64).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
        if !code_ok(&self.internal_value) {
            e.add("internal_value", "1-64 karakter huruf/angka/_/-.");
        }
        if !code_ok(&self.simkatmawa_code) {
            e.add("simkatmawa_code", "1-64 karakter huruf/angka/_/-.");
        }
        if self.label.trim().is_empty() || self.label.chars().count() > 120 {
            e.add("label", "1-120 karakter.");
        }
        if e.is_empty() { Ok(()) } else { Err(e) }
    }
}

impl Model {
    /// # Errors
    /// Galat database.
    pub async fn list(db: &DatabaseConnection, tenant_id: i64) -> ModelResult<Vec<Self>> {
        Ok(Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .order_by_asc(Column::GroupName)
            .order_by_asc(Column::InternalValue)
            .all(db)
            .await?)
    }

    /// Upsert berdasarkan (tenant, grup, nilai internal).
    ///
    /// # Errors
    /// Galat database.
    pub async fn upsert(db: &DatabaseConnection, tenant_id: i64, m: &MappingIn) -> ModelResult<Self> {
        let existing = Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .filter(Column::GroupName.eq(m.group_name.as_str()))
            .filter(Column::InternalValue.eq(m.internal_value.as_str()))
            .one(db)
            .await?;
        match existing {
            Some(row) => {
                let mut am = row.into_active_model();
                am.simkatmawa_code = ActiveValue::set(m.simkatmawa_code.clone());
                am.label = ActiveValue::set(m.label.trim().to_string());
                Ok(am.update(db).await?)
            }
            None => Ok(ActiveModel {
                tenant_id: ActiveValue::set(tenant_id),
                group_name: ActiveValue::set(m.group_name.clone()),
                internal_value: ActiveValue::set(m.internal_value.clone()),
                simkatmawa_code: ActiveValue::set(m.simkatmawa_code.clone()),
                label: ActiveValue::set(m.label.trim().to_string()),
                ..Default::default()
            }
            .insert(db)
            .await?),
        }
    }

    /// Kode SIMKATMAWA untuk nilai internal; default = nilai internal itu sendiri.
    #[must_use]
    pub fn resolve(overrides: &[Self], group: &str, internal: &str) -> String {
        overrides
            .iter()
            .find(|m| m.group_name == group && m.internal_value == internal)
            .map_or_else(|| internal.to_string(), |m| m.simkatmawa_code.clone())
    }
}

/// Katalog nilai internal beserta label (kode SIMKATMAWA bawaan = nilai internal).
#[must_use]
pub fn catalog() -> Vec<(&'static str, &'static str, &'static str)> {
    let mut out = vec![
        ("level", "KAB", "Kabupaten/Kota"),
        ("level", "PROV", "Provinsi"),
        ("level", "NAS", "Nasional"),
        ("level", "INT", "Internasional"),
        ("kategori", "RISNOV", "Riset dan Inovasi STEM"),
        ("kategori", "RISNOVSSH", "Riset dan Inovasi SSH"),
        ("kategori", "SENBUD", "Seni dan Budaya"),
        ("kategori", "OLAHRAGA", "Olahraga"),
        ("kategori", "MINAT", "Minat Khusus"),
        ("peringkat", "JUARA1", "Juara 1"),
        ("peringkat", "JUARA2", "Juara 2"),
        ("peringkat", "JUARA3", "Juara 3"),
        ("peringkat", "HARAPAN1", "Harapan 1"),
        ("peringkat", "HARAPAN2", "Harapan 2"),
        ("peringkat", "HARAPAN3", "Harapan 3"),
        ("peringkat", "APRESIASI", "Apresiasi Kejuaraan / Penghargaan Tambahan / Juara Umum"),
        ("peringkat", "PESERTA", "Peserta"),
        ("kelompok_prestasi", "INDIVIDU", "Individu"),
        ("kelompok_prestasi", "KELOMPOK", "Kelompok"),
        ("bentuk", "LURING", "Luring"),
        ("bentuk", "DARING", "Daring"),
    ];
    out.extend([
        ("jenis", "SERKOM", "Sertifikat Kompetensi"),
        ("jenis", "JURIOR", "Juri/Pelatih/Wasit Olahraga"),
        ("jenis", "JURINOR", "Juri/Pelatih/Wasit Non Olahraga"),
        ("jenis", "KEYCONF", "Keynote speaker conference"),
        ("jenis", "KEYWORK", "Keynote speaker workshop/pelatihan/bimbingan teknis"),
        ("jenis", "PAMERAN", "Pameran karya seni"),
        ("jenis", "KARYA", "Karya cipta lagu dan/atau seni tari"),
        ("jenis", "BUKU", "Penulis buku"),
        ("jenis", "PATEN", "Paten/Paten Sederhana"),
        ("jenis", "PUB", "Publikasi artikel ilmiah"),
        ("jenis", "DUTA", "Duta (Brand Ambassador)"),
        ("jenis", "PTG", "Produk Teknologi Tepat Guna"),
        ("jenis", "PSB", "Produk Seni dan Budaya"),
        ("jenis", "PKD", "Produk Kreatif Dunia Usaha dan Industri"),
    ]);
    out
}
