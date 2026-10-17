//! Laporan tahunan tata kelola kemahasiswaan (checklist indikator + isian angka). Hanya web SIMKATMAWA.

use std::collections::HashSet;

use chrono::{Datelike, Utc};
use loco_rs::prelude::*;
use serde::Deserialize;
use serde_json::{json, Value};

pub use super::_entities::institusi_reports::{self, ActiveModel, Column, Entity, Model};
use crate::{errors::FieldErrors, security::url_guard};

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

/// Kelompok indikator: (kode seksi, kode kelompok, jumlah butir). Id butir: `A.1.01`.
/// Wording resmi butir diambil dari katalog di `packages/contracts`.
pub const GROUPS: [(&str, &str, u32); 12] = [
    ("A", "A.1", 11),
    ("A", "A.2a", 6),
    ("A", "A.3", 6),
    ("A", "A.4", 6),
    ("A", "A.5", 5),
    ("A", "A.6", 3),
    ("A", "A.7", 6),
    ("A", "A.8", 3),
    ("B", "B.1", 2),
    ("B", "B.2", 6),
    ("C", "C.1", 7),
    ("E", "E.1", 6),
];

#[must_use]
pub fn known_indicator_ids() -> HashSet<String> {
    GROUPS
        .iter()
        .flat_map(|(_, group, count)| (1..=*count).map(move |n| format!("{group}.{n:02}")))
        .collect()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IndicatorIn {
    pub id: String,
    pub checked: bool,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReportInput {
    pub indikator: Vec<IndicatorIn>,
    pub jumlah_penerima_beasiswa_non_apbn: i32,
    #[serde(default)]
    pub level_kelembagaan: Option<i16>,
    pub total_anggaran_pt: i64,
    pub total_anggaran_kemahasiswaan: i64,
    /// `true` = "Simpan Laporan" (final), `false` = "Simpan Draft".
    #[serde(default)]
    pub finalize: bool,
}

pub struct Validated {
    pub indikator: Value,
    pub beasiswa: i32,
    pub level: Option<i16>,
    pub anggaran_pt: i64,
    pub anggaran_kemahasiswaan: i64,
    pub finalize: bool,
}

impl ReportInput {
    /// Aturan resmi: indikator yang dicentang WAJIB memiliki tautan dokumen.
    ///
    /// # Errors
    /// Galat per-field.
    pub fn validate(self) -> std::result::Result<Validated, FieldErrors> {
        let mut e = FieldErrors::default();
        let known = known_indicator_ids();
        let mut seen = HashSet::new();
        let indikator: Vec<Value> = self
            .indikator
            .iter()
            .map(|i| {
                if !known.contains(&i.id) {
                    e.add(&format!("indikator.{}", i.id), "Indikator tidak dikenal.");
                }
                if !seen.insert(i.id.clone()) {
                    e.add(&format!("indikator.{}", i.id), "Indikator duplikat.");
                }
                let url = i.url.as_deref().map(str::trim).filter(|u| !u.is_empty());
                let url = match (i.checked, url) {
                    (true, None) => {
                        e.add(&format!("indikator.{}", i.id), "Indikator yang dicentang wajib memiliki tautan dokumen.");
                        None
                    }
                    (_, Some(u)) => match url_guard::public_link(u) {
                        Ok(clean) => Some(clean),
                        Err(msg) => {
                            e.add(&format!("indikator.{}", i.id), msg);
                            None
                        }
                    },
                    (false, None) => None,
                };
                json!({"id": i.id, "checked": i.checked, "url": url})
            })
            .collect();

        if self.jumlah_penerima_beasiswa_non_apbn < 0 {
            e.add("jumlah_penerima_beasiswa_non_apbn", "Tidak boleh negatif.");
        }
        if self.total_anggaran_pt < 0 || self.total_anggaran_kemahasiswaan < 0 {
            e.add("total_anggaran_pt", "Anggaran tidak boleh negatif.");
        }
        if self.total_anggaran_kemahasiswaan > self.total_anggaran_pt {
            e.add("total_anggaran_kemahasiswaan", "Anggaran kemahasiswaan tidak boleh melebihi total anggaran PT.");
        }
        if self.level_kelembagaan.is_some_and(|l| !(1..=3).contains(&l)) {
            e.add("level_kelembagaan", "Level 1, 2, atau 3.");
        }
        if e.is_empty() {
            Ok(Validated {
                indikator: Value::Array(indikator),
                beasiswa: self.jumlah_penerima_beasiswa_non_apbn,
                level: self.level_kelembagaan,
                anggaran_pt: self.total_anggaran_pt,
                anggaran_kemahasiswaan: self.total_anggaran_kemahasiswaan,
                finalize: self.finalize,
            })
        } else {
            Err(e)
        }
    }
}

#[must_use]
pub fn valid_year(tahun: i32) -> bool {
    (2000..=Utc::now().year() + 1).contains(&tahun)
}

impl Model {
    /// # Errors
    /// Galat database.
    pub async fn find_for_year(db: &DatabaseConnection, tenant_id: i64, tahun: i32) -> ModelResult<Option<Self>> {
        Ok(Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .filter(Column::Tahun.eq(tahun))
            .one(db)
            .await?)
    }

    /// Simpan draft/final. Laporan yang sudah final tidak dapat diubah kembali menjadi draft.
    ///
    /// # Errors
    /// `conflict` bila laporan final dicoba diubah.
    pub async fn upsert(db: &DatabaseConnection, tenant_id: i64, tahun: i32, user_id: i64, v: Validated) -> ModelResult<Self> {
        let status = if v.finalize { "SUBMITTED" } else { "DRAFT" };
        match Self::find_for_year(db, tenant_id, tahun).await? {
            Some(existing) => {
                if existing.status == "SUBMITTED" {
                    return Err(ModelError::msg("conflict:Laporan yang sudah disimpan final tidak dapat diubah."));
                }
                let mut am = existing.into_active_model();
                am.indikator = ActiveValue::set(v.indikator);
                am.jumlah_penerima_beasiswa_non_apbn = ActiveValue::set(v.beasiswa);
                am.level_kelembagaan = ActiveValue::set(v.level);
                am.total_anggaran_pt = ActiveValue::set(v.anggaran_pt);
                am.total_anggaran_kemahasiswaan = ActiveValue::set(v.anggaran_kemahasiswaan);
                am.status = ActiveValue::set(status.to_string());
                am.updated_by = ActiveValue::set(Some(user_id));
                Ok(am.update(db).await?)
            }
            None => Ok(ActiveModel {
                pid: ActiveValue::set(Uuid::new_v4()),
                tenant_id: ActiveValue::set(tenant_id),
                tahun: ActiveValue::set(tahun),
                indikator: ActiveValue::set(v.indikator),
                jumlah_penerima_beasiswa_non_apbn: ActiveValue::set(v.beasiswa),
                level_kelembagaan: ActiveValue::set(v.level),
                total_anggaran_pt: ActiveValue::set(v.anggaran_pt),
                total_anggaran_kemahasiswaan: ActiveValue::set(v.anggaran_kemahasiswaan),
                status: ActiveValue::set(status.to_string()),
                updated_by: ActiveValue::set(Some(user_id)),
                ..Default::default()
            }
            .insert(db)
            .await?),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(indikator: Vec<IndicatorIn>) -> ReportInput {
        ReportInput {
            indikator,
            jumlah_penerima_beasiswa_non_apbn: 10,
            level_kelembagaan: Some(2),
            total_anggaran_pt: 1_000_000,
            total_anggaran_kemahasiswaan: 100_000,
            finalize: false,
        }
    }

    #[test]
    fn catalog_ids_are_unique() {
        let ids = known_indicator_ids();
        let total: u32 = GROUPS.iter().map(|g| g.2).sum();
        assert_eq!(ids.len() as u32, total);
    }

    #[test]
    fn checked_indicator_requires_document_link() {
        let bad = input(vec![IndicatorIn { id: "A.1.01".into(), checked: true, url: None }]);
        assert!(bad.validate().is_err());
        let ok = input(vec![IndicatorIn { id: "A.1.01".into(), checked: true, url: Some("https://x.ac.id/sk.pdf".into()) }]);
        assert!(ok.validate().is_ok());
    }

    #[test]
    fn rejects_unknown_duplicate_and_budget_overflow() {
        let dup = input(vec![
            IndicatorIn { id: "A.1.01".into(), checked: false, url: None },
            IndicatorIn { id: "A.1.01".into(), checked: false, url: None },
            IndicatorIn { id: "Z.9.99".into(), checked: false, url: None },
        ]);
        let err = dup.validate().err().expect("invalid");
        assert!(err.0.contains_key("indikator.Z.9.99"));
        let mut over = input(vec![]);
        over.total_anggaran_kemahasiswaan = 2_000_000;
        assert!(over.validate().is_err());
    }
}
