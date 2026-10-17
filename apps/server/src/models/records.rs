//! Prestasi mandiri, sertifikasi, dan rekognisi: satu tabel `records` dengan kolom `kind`.
//!
//! Siklus hidup: DRAFT -> SUBMITTED_INTERNAL -> VERIFIED -> QUEUED -> SENDING -> SENT
//! (atau FAILED -> QUEUED lagi, NEED_REVISION, CANCELLED). Status hanya bisa diubah lewat
//! transisi di model ini, tidak pernah dari body request (anti mass-assignment).

use chrono::{NaiveDate, Utc};
use loco_rs::prelude::*;
use sea_orm::sea_query::{Expr, ExprTrait};
use sea_orm::{QuerySelect, Select, TransactionTrait};
use serde::Deserialize;
use serde_json::{json, Map, Value};

pub use super::_entities::records::{self, ActiveModel, Column, Entity, Model};
use crate::{errors::FieldErrors, security::url_guard};

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

pub mod status {
    pub const DRAFT: &str = "DRAFT";
    pub const SUBMITTED_INTERNAL: &str = "SUBMITTED_INTERNAL";
    pub const NEED_REVISION: &str = "NEED_REVISION";
    pub const VERIFIED: &str = "VERIFIED";
    pub const QUEUED: &str = "QUEUED";
    pub const SENDING: &str = "SENDING";
    pub const SENT: &str = "SENT";
    pub const FAILED: &str = "FAILED";
    pub const CANCELLED: &str = "CANCELLED";

    /// Status di mana isi data masih boleh diubah.
    pub const EDITABLE: [&str; 3] = [DRAFT, NEED_REVISION, SUBMITTED_INTERNAL];
    /// Status di mana data boleh dihapus/dibatalkan.
    pub const REMOVABLE: [&str; 4] = [DRAFT, NEED_REVISION, SUBMITTED_INTERNAL, CANCELLED];
}

pub const LEVELS: [&str; 4] = ["KAB", "PROV", "NAS", "INT"];
pub const KATEGORI: [&str; 5] = ["RISNOV", "RISNOVSSH", "SENBUD", "OLAHRAGA", "MINAT"];
pub const PERINGKAT: [&str; 8] = [
    "JUARA1", "JUARA2", "JUARA3", "HARAPAN1", "HARAPAN2", "HARAPAN3", "APRESIASI", "PESERTA",
];
pub const KELOMPOK: [&str; 2] = ["INDIVIDU", "KELOMPOK"];
pub const BENTUK: [&str; 2] = ["LURING", "DARING"];
pub const JENIS_REKOGNISI: [&str; 14] = [
    "SERKOM", "JURIOR", "JURINOR", "KEYCONF", "KEYWORK", "PAMERAN", "KARYA", "BUKU", "PATEN",
    "PUB", "DUTA", "PTG", "PSB", "PKD",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    PrestasiMandiri,
    Sertifikasi,
    Rekognisi,
}

impl Kind {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PrestasiMandiri => "PRESTASI_MANDIRI",
            Self::Sertifikasi => "SERTIFIKASI",
            Self::Rekognisi => "REKOGNISI",
        }
    }

    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "PRESTASI_MANDIRI" => Some(Self::PrestasiMandiri),
            "SERTIFIKASI" => Some(Self::Sertifikasi),
            "REKOGNISI" => Some(Self::Rekognisi),
            _ => None,
        }
    }

    /// Endpoint SIMKATMAWA untuk jenis ini.
    #[must_use]
    pub const fn api_path(self) -> &'static str {
        match self {
            Self::PrestasiMandiri => "/api/prestasi-mandiri",
            Self::Sertifikasi => "/api/sertifikasi",
            Self::Rekognisi => "/api/rekognisi",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MahasiswaIn {
    pub nim: String,
    pub nama: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DosenIn {
    pub nuptk: String,
    pub nama: String,
    #[serde(default)]
    pub url_surat_tugas: Option<String>,
}

/// Body create/update. `deny_unknown_fields` menolak `status`, `tenant_id`, `created_by`,
/// `simkatmawa_id`, dsb. yang tidak boleh diisi klien (A.8.28, mass assignment).
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RecordInput {
    pub nama: String,
    pub level: String,
    pub penyelenggara: String,
    pub url_peserta: String,
    pub url_sertifikat: String,
    pub tgl_sertifikat: String,
    #[serde(default)]
    pub url_foto_upp: Option<String>,
    #[serde(default)]
    pub url_dokumen_undangan: Option<String>,
    #[serde(default)]
    pub keterangan: Option<String>,
    #[serde(default)]
    pub mahasiswa: Vec<MahasiswaIn>,
    #[serde(default)]
    pub dosen: Vec<DosenIn>,
    // khusus prestasi mandiri
    #[serde(default)]
    pub kategori: Option<String>,
    #[serde(default)]
    pub cabang: Option<String>,
    #[serde(default)]
    pub peringkat: Option<String>,
    #[serde(default)]
    pub jumlah_unit_peserta: Option<String>,
    #[serde(default)]
    pub kelompok_prestasi: Option<String>,
    #[serde(default)]
    pub bentuk: Option<String>,
    // khusus rekognisi
    #[serde(default)]
    pub jenis: Option<String>,
    /// Kunci optimistic-lock saat update.
    #[serde(default)]
    pub version: Option<i32>,
    /// UUID yang dibuat klien sebelum draf disimpan, agar berkas dapat diunggah dan tautannya
    /// terisi otomatis sejak formulir baru. Hanya dipakai saat membuat; diabaikan saat update.
    #[serde(default)]
    pub client_ref: Option<Uuid>,
}

pub struct Validated {
    pub nama: String,
    pub level: String,
    pub penyelenggara: String,
    pub url_peserta: String,
    pub url_sertifikat: String,
    pub tgl_sertifikat: NaiveDate,
    pub url_foto_upp: Option<String>,
    pub url_dokumen_undangan: Option<String>,
    pub keterangan: Option<String>,
    pub mahasiswa: Value,
    pub dosen: Value,
    pub extra: Value,
}

fn blank_to_none(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn one_of(errors: &mut FieldErrors, field: &str, value: Option<&String>, allowed: &[&str]) -> String {
    match value.map(|v| v.trim()) {
        Some(v) if allowed.contains(&v) => v.to_string(),
        _ => {
            errors.add(field, &format!("Pilih salah satu: {}.", allowed.join(", ")));
            String::new()
        }
    }
}

fn required_text(errors: &mut FieldErrors, field: &str, value: &str, max: usize) -> String {
    let v = value.trim();
    if v.is_empty() || v.chars().count() > max || v.chars().any(char::is_control) {
        errors.add(field, &format!("Wajib diisi (maks {max} karakter, tanpa karakter kontrol)."));
    }
    v.to_string()
}

fn required_link(errors: &mut FieldErrors, field: &str, value: &str) -> String {
    match url_guard::public_link(value) {
        Ok(u) => u,
        Err(msg) => {
            errors.add(field, msg);
            String::new()
        }
    }
}

fn optional_link(errors: &mut FieldErrors, field: &str, value: Option<String>) -> Option<String> {
    blank_to_none(value).and_then(|v| match url_guard::public_link(&v) {
        Ok(u) => Some(u),
        Err(msg) => {
            errors.add(field, msg);
            None
        }
    })
}

impl RecordInput {
    /// Validasi ketat sisi-server. `allow_kab_rekognisi` mengikuti pengaturan tenant.
    ///
    /// # Errors
    /// Galat per-field.
    pub fn validate(self, kind: Kind, allow_kab_rekognisi: bool) -> std::result::Result<Validated, FieldErrors> {
        let mut e = FieldErrors::default();
        let nama = required_text(&mut e, "nama", &self.nama, 300);
        let penyelenggara = required_text(&mut e, "penyelenggara", &self.penyelenggara, 300);
        let level_allowed: Vec<&str> = if kind == Kind::Rekognisi && !allow_kab_rekognisi {
            LEVELS.iter().copied().filter(|l| *l != "KAB").collect()
        } else {
            LEVELS.to_vec()
        };
        let level = one_of(&mut e, "level", Some(&self.level), &level_allowed);
        let url_peserta = required_link(&mut e, "url_peserta", &self.url_peserta);
        let url_sertifikat = required_link(&mut e, "url_sertifikat", &self.url_sertifikat);
        let url_foto_upp = optional_link(&mut e, "url_foto_upp", self.url_foto_upp);
        let url_dokumen_undangan = optional_link(&mut e, "url_dokumen_undangan", self.url_dokumen_undangan);

        let tgl = match NaiveDate::parse_from_str(self.tgl_sertifikat.trim(), "%Y-%m-%d") {
            Ok(d) if d >= NaiveDate::from_ymd_opt(2000, 1, 1).unwrap_or(d)
                && d <= Utc::now().date_naive() + chrono::Duration::days(1) =>
            {
                d
            }
            _ => {
                e.add("tgl_sertifikat", "Tanggal tidak valid (format YYYY-MM-DD, tidak di masa depan).");
                NaiveDate::default()
            }
        };

        let keterangan = blank_to_none(self.keterangan);
        if keterangan.as_ref().is_some_and(|k| k.chars().count() > 1000) {
            e.add("keterangan", "Maksimal 1000 karakter.");
        }

        if self.mahasiswa.is_empty() || self.mahasiswa.len() > 50 {
            e.add("mahasiswa", "Minimal 1 dan maksimal 50 mahasiswa.");
        }
        let nim_ok = |s: &str| (3..=30).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'/');
        let mahasiswa: Vec<Value> = self
            .mahasiswa
            .iter()
            .enumerate()
            .map(|(i, m)| {
                if !nim_ok(m.nim.trim()) {
                    e.add(&format!("mahasiswa[{i}].nim"), "NIM 3-30 karakter (huruf, angka, . - /).");
                }
                if m.nama.trim().chars().count() < 2 || m.nama.chars().count() > 120 || m.nama.chars().any(char::is_control) {
                    e.add(&format!("mahasiswa[{i}].nama"), "Nama 2-120 karakter.");
                }
                json!({"nim": m.nim.trim(), "nama": m.nama.trim()})
            })
            .collect();

        if self.dosen.len() > 20 {
            e.add("dosen", "Maksimal 20 dosen.");
        }
        let dosen: Vec<Value> = self
            .dosen
            .iter()
            .enumerate()
            .map(|(i, d)| {
                if !(5..=25).contains(&d.nuptk.trim().len()) || !d.nuptk.trim().bytes().all(|b| b.is_ascii_digit()) {
                    e.add(&format!("dosen[{i}].nuptk"), "NUPTK 5-25 digit angka.");
                }
                if d.nama.trim().chars().count() < 2 || d.nama.chars().count() > 120 || d.nama.chars().any(char::is_control) {
                    e.add(&format!("dosen[{i}].nama"), "Nama 2-120 karakter.");
                }
                let surat = optional_link(&mut e, &format!("dosen[{i}].url_surat_tugas"), d.url_surat_tugas.clone());
                json!({"nuptk": d.nuptk.trim(), "nama": d.nama.trim(), "url_surat_tugas": surat})
            })
            .collect();

        let mut extra = Map::new();
        match kind {
            Kind::PrestasiMandiri => {
                extra.insert("kategori".into(), json!(one_of(&mut e, "kategori", self.kategori.as_ref(), &KATEGORI)));
                extra.insert("peringkat".into(), json!(one_of(&mut e, "peringkat", self.peringkat.as_ref(), &PERINGKAT)));
                extra.insert("kelompok_prestasi".into(), json!(one_of(&mut e, "kelompok_prestasi", self.kelompok_prestasi.as_ref(), &KELOMPOK)));
                extra.insert("bentuk".into(), json!(one_of(&mut e, "bentuk", self.bentuk.as_ref(), &BENTUK)));
                let cabang = required_text(&mut e, "cabang", self.cabang.as_deref().unwrap_or(""), 200);
                extra.insert("cabang".into(), json!(cabang));
                let unit = self.jumlah_unit_peserta.as_deref().unwrap_or("").trim().to_string();
                if unit.is_empty() || unit.len() > 5 || !unit.bytes().all(|b| b.is_ascii_digit()) || unit == "0" {
                    e.add("jumlah_unit_peserta", "Isi angka 1-99999.");
                }
                extra.insert("jumlah_unit_peserta".into(), json!(unit));
            }
            Kind::Rekognisi => {
                extra.insert("jenis".into(), json!(one_of(&mut e, "jenis", self.jenis.as_ref(), &JENIS_REKOGNISI)));
            }
            Kind::Sertifikasi => {}
        }

        if e.is_empty() {
            Ok(Validated {
                nama,
                level,
                penyelenggara,
                url_peserta,
                url_sertifikat,
                tgl_sertifikat: tgl,
                url_foto_upp,
                url_dokumen_undangan,
                keterangan,
                mahasiswa: Value::Array(mahasiswa),
                dosen: Value::Array(dosen),
                extra: Value::Object(extra),
            })
        } else {
            Err(e)
        }
    }
}

/// Kriteria daftar. `owner` membatasi ke pembuat (peran MAHASISWA).
pub struct ListQuery<'a> {
    pub tenant_id: i64,
    pub kind: Kind,
    pub owner: Option<i64>,
    pub status: Option<&'a str>,
    pub search: Option<&'a str>,
    pub page: u64,
    pub page_size: u64,
}

fn escape_like(raw: &str) -> String {
    raw.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

impl Model {
    fn scoped(tenant_id: i64, kind: Kind, owner: Option<i64>) -> Select<Entity> {
        let mut q = Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .filter(Column::Kind.eq(kind.as_str()));
        if let Some(owner) = owner {
            q = q.filter(Column::CreatedBy.eq(owner));
        }
        q
    }

    /// # Errors
    /// Galat database.
    pub async fn list(db: &DatabaseConnection, q: &ListQuery<'_>) -> ModelResult<(Vec<Self>, u64)> {
        let mut select = Self::scoped(q.tenant_id, q.kind, q.owner);
        if let Some(status) = q.status {
            select = select.filter(Column::Status.eq(status));
        }
        if let Some(term) = q.search.map(str::trim).filter(|s| !s.is_empty()) {
            let pattern = format!("%{}%", escape_like(&term.chars().take(100).collect::<String>()));
            select = select.filter(
                Condition::any()
                    .add(Expr::cust_with_values("nama ILIKE ?", [pattern.clone()]))
                    .add(Expr::cust_with_values("penyelenggara ILIKE ?", [pattern])),
            );
        }
        let paginator = select
            .order_by_desc(Column::CreatedAt)
            .paginate(db, q.page_size);
        let total = paginator.num_items().await?;
        let items = paginator.fetch_page(q.page.saturating_sub(1)).await?;
        Ok((items, total))
    }

    /// # Errors
    /// `EntityNotFound` bila tidak ada pada tenant/jenis/pemilik tersebut.
    pub async fn find_scoped(
        db: &impl ConnectionTrait,
        tenant_id: i64,
        kind: Kind,
        owner: Option<i64>,
        pid: Uuid,
    ) -> ModelResult<Self> {
        Self::scoped(tenant_id, kind, owner)
            .filter(Column::Pid.eq(pid))
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)
    }

    /// # Errors
    /// Galat database.
    pub async fn create(
        db: &DatabaseConnection,
        tenant_id: i64,
        kind: Kind,
        created_by: i64,
        pid: Option<Uuid>,
        v: Validated,
    ) -> ModelResult<Self> {
        let inserted = ActiveModel {
            pid: ActiveValue::set(pid.unwrap_or_else(Uuid::new_v4)),
            tenant_id: ActiveValue::set(tenant_id),
            kind: ActiveValue::set(kind.as_str().to_string()),
            status: ActiveValue::set(status::DRAFT.to_string()),
            nama: ActiveValue::set(v.nama),
            level: ActiveValue::set(v.level),
            penyelenggara: ActiveValue::set(v.penyelenggara),
            url_peserta: ActiveValue::set(v.url_peserta),
            url_sertifikat: ActiveValue::set(v.url_sertifikat),
            tgl_sertifikat: ActiveValue::set(v.tgl_sertifikat),
            url_foto_upp: ActiveValue::set(v.url_foto_upp),
            url_dokumen_undangan: ActiveValue::set(v.url_dokumen_undangan),
            keterangan: ActiveValue::set(v.keterangan),
            mahasiswa: ActiveValue::set(v.mahasiswa),
            dosen: ActiveValue::set(v.dosen),
            extra: ActiveValue::set(v.extra),
            submission_attempts: ActiveValue::set(0),
            idempotency_key: ActiveValue::set(Uuid::new_v4()),
            version: ActiveValue::set(1),
            created_by: ActiveValue::set(Some(created_by)),
            ..Default::default()
        }
        .insert(db)
        .await;
        match inserted {
            Ok(row) => Ok(row),
            // pid dari klien sudah dipakai: jangan menimpa atau membocorkan data milik orang lain.
            Err(e) if matches!(e.sql_err(), Some(sea_orm::SqlErr::UniqueConstraintViolation(_))) => {
                Err(ModelError::msg("conflict:Referensi draf sudah dipakai. Muat ulang formulir."))
            }
            Err(e) => Err(e.into()),
        }
    }

    /// Mengubah isi data dengan kunci baris + optimistic locking.
    ///
    /// # Errors
    /// `Message("conflict:...")` bila status tidak boleh diedit atau versi basi.
    pub async fn update_content(
        db: &DatabaseConnection,
        tenant_id: i64,
        kind: Kind,
        owner: Option<i64>,
        pid: Uuid,
        expected_version: i32,
        v: Validated,
    ) -> ModelResult<Self> {
        let txn = db.begin().await?;
        let current = Self::scoped(tenant_id, kind, owner)
            .filter(Column::Pid.eq(pid))
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or(ModelError::EntityNotFound)?;
        if !status::EDITABLE.contains(&current.status.as_str()) {
            return Err(ModelError::msg("conflict:Data berstatus ini tidak dapat diubah."));
        }
        if current.version != expected_version {
            return Err(ModelError::msg("conflict:Data telah diubah pengguna lain. Muat ulang."));
        }
        let mut am = current.clone().into_active_model();
        am.nama = ActiveValue::set(v.nama);
        am.level = ActiveValue::set(v.level);
        am.penyelenggara = ActiveValue::set(v.penyelenggara);
        am.url_peserta = ActiveValue::set(v.url_peserta);
        am.url_sertifikat = ActiveValue::set(v.url_sertifikat);
        am.tgl_sertifikat = ActiveValue::set(v.tgl_sertifikat);
        am.url_foto_upp = ActiveValue::set(v.url_foto_upp);
        am.url_dokumen_undangan = ActiveValue::set(v.url_dokumen_undangan);
        am.keterangan = ActiveValue::set(v.keterangan);
        am.mahasiswa = ActiveValue::set(v.mahasiswa);
        am.dosen = ActiveValue::set(v.dosen);
        am.extra = ActiveValue::set(v.extra);
        am.version = ActiveValue::set(current.version + 1);
        let saved = am.update(&txn).await?;
        txn.commit().await?;
        Ok(saved)
    }

    /// Transisi status atomik dengan kunci baris.
    ///
    /// # Errors
    /// `Message("conflict:...")` bila status asal tidak diizinkan.
    #[allow(clippy::too_many_arguments)]
    pub async fn transition(
        db: &DatabaseConnection,
        tenant_id: i64,
        kind: Kind,
        owner: Option<i64>,
        pid: Uuid,
        from: &[&str],
        to: &str,
        note: Option<String>,
    ) -> ModelResult<Self> {
        let txn = db.begin().await?;
        let current = Self::scoped(tenant_id, kind, owner)
            .filter(Column::Pid.eq(pid))
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or(ModelError::EntityNotFound)?;
        if !from.contains(&current.status.as_str()) {
            return Err(ModelError::msg(&format!(
                "conflict:Status {} tidak dapat dipindah ke {to}.",
                current.status
            )));
        }
        let mut am = current.into_active_model();
        am.status = ActiveValue::set(to.to_string());
        am.revision_note = ActiveValue::set(note.map(|n| n.chars().take(500).collect()));
        if to == status::QUEUED {
            am.last_error = ActiveValue::set(None);
        }
        let saved = am.update(&txn).await?;
        txn.commit().await?;
        Ok(saved)
    }

    /// # Errors
    /// `conflict` bila status tidak boleh dihapus.
    pub async fn remove(
        db: &DatabaseConnection,
        tenant_id: i64,
        kind: Kind,
        owner: Option<i64>,
        pid: Uuid,
    ) -> ModelResult<()> {
        let txn = db.begin().await?;
        let current = Self::scoped(tenant_id, kind, owner)
            .filter(Column::Pid.eq(pid))
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or(ModelError::EntityNotFound)?;
        if !status::REMOVABLE.contains(&current.status.as_str()) {
            return Err(ModelError::msg("conflict:Data yang sudah diproses/terkirim tidak dapat dihapus."));
        }
        Entity::delete_by_id(current.id).exec(&txn).await?;
        txn.commit().await?;
        Ok(())
    }

    /// Apakah sertifikat yang sama (jenis + tautan) sudah dikirim/antre untuk mahasiswa yang sama.
    /// Mencegah data ganda di SIMKATMAWA akibat input dobel; sertifikat kelompok yang sama untuk
    /// mahasiswa berbeda tetap boleh.
    ///
    /// # Errors
    /// Galat database.
    pub async fn already_submitted(db: &impl ConnectionTrait, current: &Self) -> ModelResult<bool> {
        let others = Entity::find()
            .filter(Column::TenantId.eq(current.tenant_id))
            .filter(Column::Kind.eq(current.kind.as_str()))
            .filter(Column::UrlSertifikat.eq(current.url_sertifikat.as_str()))
            .filter(Column::Status.is_in([status::QUEUED, status::SENDING, status::SENT]))
            .filter(Column::Id.ne(current.id))
            .all(db)
            .await?;
        let nims = |v: &Value| -> std::collections::HashSet<String> {
            v.as_array()
                .map(|a| a.iter().filter_map(|m| m.get("nim").and_then(Value::as_str).map(str::to_string)).collect())
                .unwrap_or_default()
        };
        let mine = nims(&current.mahasiswa);
        Ok(others.iter().any(|o| !nims(&o.mahasiswa).is_disjoint(&mine)))
    }

    /// Apakah `pid` sudah dipakai record mana pun (lintas tenant). Dipakai agar berkas boleh diunggah
    /// untuk draf yang belum disimpan tanpa bisa menempel ke record milik orang lain.
    ///
    /// # Errors
    /// Galat database.
    pub async fn pid_taken(db: &impl ConnectionTrait, pid: Uuid) -> ModelResult<bool> {
        Ok(Entity::find().filter(Column::Pid.eq(pid)).one(db).await?.is_some())
    }

    /// Compare-and-set `QUEUED -> SENDING`. Hanya satu worker yang menang (idempoten).
    ///
    /// # Errors
    /// Galat database.
    pub async fn begin_sending(db: &DatabaseConnection, id: i64) -> ModelResult<Option<Self>> {
        let res = Entity::update_many()
            .col_expr(Column::Status, Expr::value(status::SENDING))
            .col_expr(Column::SubmissionAttempts, Expr::col(Column::SubmissionAttempts).add(1))
            .filter(Column::Id.eq(id))
            .filter(Column::Status.eq(status::QUEUED))
            .exec(db)
            .await?;
        if res.rows_affected == 0 {
            return Ok(None);
        }
        Ok(Entity::find_by_id(id).one(db).await?)
    }

    /// # Errors
    /// Galat database.
    pub async fn mark_sent(
        db: &DatabaseConnection,
        id: i64,
        simkatmawa_id: &str,
        kode_pt: Option<&str>,
        tahun: Option<&str>,
    ) -> ModelResult<Self> {
        let current = Entity::find_by_id(id).one(db).await?.ok_or(ModelError::EntityNotFound)?;
        let mut am = current.into_active_model();
        am.status = ActiveValue::set(status::SENT.to_string());
        am.simkatmawa_id = ActiveValue::set(Some(simkatmawa_id.chars().take(64).collect()));
        am.simkatmawa_kode_pt = ActiveValue::set(kode_pt.map(|s| s.chars().take(16).collect()));
        am.simkatmawa_tahun = ActiveValue::set(tahun.map(|s| s.chars().take(8).collect()));
        am.sent_at = ActiveValue::set(Some(Utc::now().fixed_offset()));
        am.last_error = ActiveValue::set(None);
        Ok(am.update(db).await?)
    }

    /// `retry = true` mengembalikan ke QUEUED; selain itu FAILED (butuh tindakan admin).
    ///
    /// # Errors
    /// Galat database.
    pub async fn mark_error(db: &DatabaseConnection, id: i64, message: &str, retry: bool) -> ModelResult<Self> {
        let current = Entity::find_by_id(id).one(db).await?.ok_or(ModelError::EntityNotFound)?;
        let mut am = current.into_active_model();
        am.status = ActiveValue::set(if retry { status::QUEUED } else { status::FAILED }.to_string());
        am.last_error = ActiveValue::set(Some(message.chars().take(500).collect()));
        Ok(am.update(db).await?)
    }

    /// Ringkasan (kind, status, jumlah) untuk dashboard.
    ///
    /// # Errors
    /// Galat database.
    pub async fn counts(db: &DatabaseConnection, tenant_id: i64, owner: Option<i64>) -> ModelResult<Vec<(String, String, i64)>> {
        let mut q = Entity::find()
            .select_only()
            .column(Column::Kind)
            .column(Column::Status)
            .column_as(Column::Id.count(), "total")
            .filter(Column::TenantId.eq(tenant_id));
        if let Some(owner) = owner {
            q = q.filter(Column::CreatedBy.eq(owner));
        }
        Ok(q.group_by(Column::Kind)
            .group_by(Column::Status)
            .into_tuple::<(String, String, i64)>()
            .all(db)
            .await?)
    }
}

/// Menaruh mahasiswa pemilik akun di urutan pertama dengan NIM dan nama dari Portal.
/// Entri dengan NIM yang sama diganti agar tidak ganda dan nama tidak bisa dipalsukan.
pub fn put_own_first(list: &mut Vec<Value>, nim: &str, nama: &str) {
    list.retain(|m| m.get("nim").and_then(Value::as_str) != Some(nim));
    list.insert(0, json!({"nim": nim, "nama": nama}));
}

/// Indeks entri pertama yang kuncinya (mis. "nim", "nuptk") sudah muncul sebelumnya.
#[must_use]
pub fn first_duplicate(list: &[Value], key: &str) -> Option<usize> {
    let mut seen = std::collections::HashSet::new();
    list.iter().position(|m| !seen.insert(m.get(key).and_then(Value::as_str).unwrap_or_default().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn own_student_goes_first_and_is_not_duplicated() {
        let mut list = vec![json!({"nim": "2", "nama": "B"}), json!({"nim": "1", "nama": "salah ketik"})];
        put_own_first(&mut list, "1", "Siti Aminah");
        assert_eq!(list, vec![json!({"nim": "1", "nama": "Siti Aminah"}), json!({"nim": "2", "nama": "B"})]);
    }

    #[test]
    fn detects_duplicates() {
        let list = vec![json!({"nim": "1"}), json!({"nim": "2"}), json!({"nim": "1"})];
        assert_eq!(first_duplicate(&list, "nim"), Some(2));
        assert_eq!(first_duplicate(&list[..2], "nim"), None);
    }

    fn base() -> RecordInput {
        RecordInput {
            nama: "National Programming Contest".into(),
            level: "NAS".into(),
            penyelenggara: "PT. LOMBA".into(),
            url_peserta: "https://example.ac.id/peserta".into(),
            url_sertifikat: "https://example.ac.id/sertifikat".into(),
            tgl_sertifikat: "2025-05-01".into(),
            url_foto_upp: None,
            url_dokumen_undangan: None,
            keterangan: None,
            mahasiswa: vec![MahasiswaIn { nim: "51422001".into(), nama: "Budi Santoso".into() }],
            dosen: vec![],
            kategori: Some("RISNOV".into()),
            cabang: Some("Matematika Lanjut".into()),
            peringkat: Some("JUARA1".into()),
            jumlah_unit_peserta: Some("3".into()),
            kelompok_prestasi: Some("KELOMPOK".into()),
            bentuk: Some("DARING".into()),
            jenis: None,
            version: None,
            client_ref: None,
        }
    }

    #[test]
    fn valid_prestasi_mandiri_passes() {
        let v = base().validate(Kind::PrestasiMandiri, false).expect("valid");
        assert_eq!(v.extra["kategori"], "RISNOV");
        assert_eq!(v.mahasiswa.as_array().map(Vec::len), Some(1));
    }

    #[test]
    fn rekognisi_rejects_kab_unless_enabled() {
        let mut i = base();
        i.level = "KAB".into();
        i.jenis = Some("SERKOM".into());
        assert!(i.clone().validate(Kind::Rekognisi, false).is_err());
        assert!(i.validate(Kind::Rekognisi, true).is_ok());
    }

    #[test]
    fn rejects_dangerous_links_and_missing_students() {
        let mut i = base();
        i.url_sertifikat = "javascript:alert(1)".into();
        i.mahasiswa.clear();
        let err = i.validate(Kind::PrestasiMandiri, false).err().expect("invalid");
        assert!(err.0.contains_key("url_sertifikat"));
        assert!(err.0.contains_key("mahasiswa"));
    }

    #[test]
    fn rejects_future_dates_and_bad_enums() {
        let mut i = base();
        i.tgl_sertifikat = "2999-01-01".into();
        i.peringkat = Some("JUARA9".into());
        let err = i.validate(Kind::PrestasiMandiri, false).err().expect("invalid");
        assert!(err.0.contains_key("tgl_sertifikat"));
        assert!(err.0.contains_key("peringkat"));
    }

    #[test]
    fn unknown_fields_are_rejected_at_parse_time() {
        let parsed: Result<RecordInput, _> = serde_json::from_value(json!({
            "nama": "x", "level": "NAS", "penyelenggara": "y", "url_peserta": "https://a.id",
            "url_sertifikat": "https://a.id", "tgl_sertifikat": "2025-01-01", "status": "SENT"
        }));
        assert!(parsed.is_err());
    }
}
