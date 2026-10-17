//! Laporan kejuaraan/ajang/lomba yang diselenggarakan PT (hanya web SIMKATMAWA, tanpa API).

use chrono::{Datelike, Utc};
use loco_rs::prelude::*;
use serde::Deserialize;
use serde_json::{json, Value};

pub use super::_entities::kejuaraan::{self, ActiveModel, Column, Entity, Model};
use super::records::{KATEGORI, LEVELS};
use crate::{errors::FieldErrors, security::url_guard};

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

const JENIS: [&str; 2] = ["MANDIRI", "MANDIRI_TERVERIFIKASI"];
const BENTUK_EVENT: [&str; 3] = ["LURING", "DARING", "HIBRID"];

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LaporanIn {
    pub tahun: i32,
    pub url_ajang: String,
    pub url_laporan: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KejuaraanInput {
    pub nama_ajang: String,
    pub jenis_penyelenggaraan: String,
    pub level: String,
    pub kategori: String,
    pub bentuk: String,
    pub tempat: String,
    pub url_ajang: String,
    pub tahun: i32,
    #[serde(default)]
    pub laporan: Vec<LaporanIn>,
}

pub struct Validated {
    pub nama_ajang: String,
    pub jenis_penyelenggaraan: String,
    pub level: String,
    pub kategori: String,
    pub bentuk: String,
    pub tempat: String,
    pub url_ajang: String,
    pub tahun: i32,
    pub laporan: Value,
}

fn pick(e: &mut FieldErrors, field: &str, value: &str, allowed: &[&str]) -> String {
    if allowed.contains(&value) {
        value.to_string()
    } else {
        e.add(field, &format!("Pilih salah satu: {}.", allowed.join(", ")));
        String::new()
    }
}

fn text(e: &mut FieldErrors, field: &str, value: &str, max: usize) -> String {
    let v = value.trim();
    if v.is_empty() || v.chars().count() > max || v.chars().any(char::is_control) {
        e.add(field, &format!("Wajib diisi (maks {max} karakter)."));
    }
    v.to_string()
}

fn link(e: &mut FieldErrors, field: &str, value: &str) -> String {
    url_guard::public_link(value).unwrap_or_else(|msg| {
        e.add(field, msg);
        String::new()
    })
}

impl KejuaraanInput {
    /// # Errors
    /// Galat per-field.
    pub fn validate(self) -> std::result::Result<Validated, FieldErrors> {
        let mut e = FieldErrors::default();
        let nama_ajang = text(&mut e, "nama_ajang", &self.nama_ajang, 300);
        let tempat = text(&mut e, "tempat", &self.tempat, 300);
        let jenis = pick(&mut e, "jenis_penyelenggaraan", &self.jenis_penyelenggaraan, &JENIS);
        let level = pick(&mut e, "level", &self.level, &LEVELS);
        let kategori = pick(&mut e, "kategori", &self.kategori, &KATEGORI);
        let bentuk = pick(&mut e, "bentuk", &self.bentuk, &BENTUK_EVENT);
        let url_ajang = link(&mut e, "url_ajang", &self.url_ajang);
        let max_year = Utc::now().year() + 1;
        if !(2000..=max_year).contains(&self.tahun) {
            e.add("tahun", "Tahun tidak valid.");
        }
        if self.laporan.len() > 10 {
            e.add("laporan", "Maksimal 10 laporan tahunan.");
        }
        let laporan: Vec<Value> = self
            .laporan
            .iter()
            .enumerate()
            .map(|(i, l)| {
                if !(2000..=max_year).contains(&l.tahun) {
                    e.add(&format!("laporan[{i}].tahun"), "Tahun tidak valid.");
                }
                json!({
                    "tahun": l.tahun,
                    "url_ajang": link(&mut e, &format!("laporan[{i}].url_ajang"), &l.url_ajang),
                    "url_laporan": link(&mut e, &format!("laporan[{i}].url_laporan"), &l.url_laporan),
                })
            })
            .collect();
        if e.is_empty() {
            Ok(Validated {
                nama_ajang,
                jenis_penyelenggaraan: jenis,
                level,
                kategori,
                bentuk,
                tempat,
                url_ajang,
                tahun: self.tahun,
                laporan: Value::Array(laporan),
            })
        } else {
            Err(e)
        }
    }
}

impl Model {
    /// # Errors
    /// Galat database.
    pub async fn list(db: &DatabaseConnection, tenant_id: i64, page: u64, page_size: u64) -> ModelResult<(Vec<Self>, u64)> {
        let paginator = Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .order_by_desc(Column::Tahun)
            .order_by_desc(Column::Id)
            .paginate(db, page_size);
        let total = paginator.num_items().await?;
        Ok((paginator.fetch_page(page.saturating_sub(1)).await?, total))
    }

    /// # Errors
    /// `EntityNotFound` bila bukan milik tenant.
    pub async fn find_in_tenant(db: &DatabaseConnection, tenant_id: i64, pid: Uuid) -> ModelResult<Self> {
        Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .filter(Column::Pid.eq(pid))
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)
    }

    /// # Errors
    /// Galat database.
    pub async fn create(db: &DatabaseConnection, tenant_id: i64, created_by: i64, v: Validated) -> ModelResult<Self> {
        Ok(ActiveModel {
            pid: ActiveValue::set(Uuid::new_v4()),
            tenant_id: ActiveValue::set(tenant_id),
            nama_ajang: ActiveValue::set(v.nama_ajang),
            jenis_penyelenggaraan: ActiveValue::set(v.jenis_penyelenggaraan),
            level: ActiveValue::set(v.level),
            kategori: ActiveValue::set(v.kategori),
            bentuk: ActiveValue::set(v.bentuk),
            tempat: ActiveValue::set(v.tempat),
            url_ajang: ActiveValue::set(v.url_ajang),
            tahun: ActiveValue::set(v.tahun),
            laporan: ActiveValue::set(v.laporan),
            created_by: ActiveValue::set(Some(created_by)),
            ..Default::default()
        }
        .insert(db)
        .await?)
    }
}

impl ActiveModel {
    /// # Errors
    /// Galat database.
    pub async fn apply(mut self, db: &DatabaseConnection, v: Validated) -> ModelResult<Model> {
        self.nama_ajang = ActiveValue::set(v.nama_ajang);
        self.jenis_penyelenggaraan = ActiveValue::set(v.jenis_penyelenggaraan);
        self.level = ActiveValue::set(v.level);
        self.kategori = ActiveValue::set(v.kategori);
        self.bentuk = ActiveValue::set(v.bentuk);
        self.tempat = ActiveValue::set(v.tempat);
        self.url_ajang = ActiveValue::set(v.url_ajang);
        self.tahun = ActiveValue::set(v.tahun);
        self.laporan = ActiveValue::set(v.laporan);
        Ok(self.update(db).await?)
    }
}
