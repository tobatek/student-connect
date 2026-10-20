//! DTO respons. Entitas database tidak pernah diserialisasi langsung ke klien (hash password,
//! token, dan kolom internal tidak boleh bocor).

use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use uuid::Uuid;

use crate::{
    models::{
        _entities::{audit_logs, documents, kejuaraan, master_employees, master_students, records, submission_logs, sync_runs, tenants, users},
        enum_mappings, institusi_reports, simkatmawa_credentials,
    },
    security::roles::{Perm, Role},
};

type Ts = DateTime<FixedOffset>;

#[derive(Debug, Deserialize)]
pub struct PageQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
}

impl PageQuery {
    #[must_use]
    pub fn normalized(&self) -> (u64, u64) {
        (self.page.unwrap_or(1).clamp(1, 100_000), self.page_size.unwrap_or(20).clamp(1, 100))
    }
}

#[derive(Debug, Serialize)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub page: u64,
    pub page_size: u64,
    pub total_items: u64,
    pub total_pages: u64,
}

impl<T> Page<T> {
    #[must_use]
    pub fn new(items: Vec<T>, page: u64, page_size: u64, total_items: u64) -> Self {
        Self { items, page, page_size, total_items, total_pages: total_items.div_ceil(page_size.max(1)) }
    }
}

#[derive(Debug, Serialize)]
pub struct UserView {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub is_active: bool,
    pub must_change_password: bool,
    pub last_login_at: Option<Ts>,
    pub created_at: Ts,
}

impl From<&users::Model> for UserView {
    fn from(u: &users::Model) -> Self {
        Self {
            id: u.pid,
            email: u.email.clone(),
            name: u.name.clone(),
            role: u.role.clone(),
            is_active: u.is_active,
            must_change_password: u.must_change_password,
            last_login_at: u.last_login_at,
            created_at: u.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct TenantView {
    pub id: Uuid,
    pub slug: String,
    pub nama_pt: String,
    pub kode_pt: String,
    pub tahun_aktif: i32,
    pub allow_kab_rekognisi: bool,
}

impl From<&tenants::Model> for TenantView {
    fn from(t: &tenants::Model) -> Self {
        Self {
            id: t.pid,
            slug: t.slug.clone(),
            nama_pt: t.nama_pt.clone(),
            kode_pt: t.kode_pt.clone(),
            tahun_aktif: t.tahun_aktif,
            allow_kab_rekognisi: t.allow_kab_rekognisi,
        }
    }
}

/// Identitas mahasiswa dari Portal untuk mengisi formulir otomatis (NIM dan nama kanonik).
#[derive(Debug, Serialize)]
pub struct StudentView {
    pub nim: String,
    pub nama: String,
}

#[derive(Debug, Serialize)]
pub struct MeView {
    pub user: UserView,
    pub tenant: TenantView,
    pub csrf_token: String,
    pub permissions: Vec<&'static str>,
    pub student: Option<StudentView>,
}

impl MeView {
    #[must_use]
    pub fn new(user: &users::Model, tenant: &tenants::Model, role: Role, csrf_token: String) -> Self {
        Self {
            user: UserView::from(user),
            tenant: TenantView::from(tenant),
            csrf_token,
            permissions: Perm::ALL.iter().filter(|p| role.can(**p)).map(|p| p.name()).collect(),
            student: None,
        }
    }

    #[must_use]
    pub fn with_student(mut self, student: Option<StudentView>) -> Self {
        self.student = student;
        self
    }
}

#[derive(Debug, Serialize)]
pub struct RecordView {
    pub id: Uuid,
    pub kind: String,
    pub status: String,
    pub nama: String,
    pub level: String,
    pub penyelenggara: String,
    pub url_peserta: String,
    pub url_sertifikat: String,
    pub tgl_sertifikat: String,
    pub url_foto_upp: Option<String>,
    pub url_dokumen_undangan: Option<String>,
    pub keterangan: Option<String>,
    pub mahasiswa: Value,
    pub dosen: Value,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
    pub simkatmawa_id: Option<String>,
    pub simkatmawa_kode_pt: Option<String>,
    pub simkatmawa_tahun: Option<String>,
    pub sent_at: Option<Ts>,
    pub last_error: Option<String>,
    pub submission_attempts: i32,
    pub revision_note: Option<String>,
    pub version: i32,
    pub created_at: Ts,
    pub updated_at: Ts,
}

impl From<&records::Model> for RecordView {
    fn from(r: &records::Model) -> Self {
        Self {
            id: r.pid,
            kind: r.kind.clone(),
            status: r.status.clone(),
            nama: r.nama.clone(),
            level: r.level.clone(),
            penyelenggara: r.penyelenggara.clone(),
            url_peserta: r.url_peserta.clone(),
            url_sertifikat: r.url_sertifikat.clone(),
            tgl_sertifikat: r.tgl_sertifikat.format("%Y-%m-%d").to_string(),
            url_foto_upp: r.url_foto_upp.clone(),
            url_dokumen_undangan: r.url_dokumen_undangan.clone(),
            keterangan: r.keterangan.clone(),
            mahasiswa: r.mahasiswa.clone(),
            dosen: r.dosen.clone(),
            extra: r.extra.as_object().cloned().unwrap_or_default(),
            simkatmawa_id: r.simkatmawa_id.clone(),
            simkatmawa_kode_pt: r.simkatmawa_kode_pt.clone(),
            simkatmawa_tahun: r.simkatmawa_tahun.clone(),
            sent_at: r.sent_at,
            last_error: r.last_error.clone(),
            submission_attempts: r.submission_attempts,
            revision_note: r.revision_note.clone(),
            version: r.version,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct KejuaraanView {
    pub id: Uuid,
    pub nama_ajang: String,
    pub jenis_penyelenggaraan: String,
    pub level: String,
    pub kategori: String,
    pub bentuk: String,
    pub tempat: String,
    pub url_ajang: String,
    pub tahun: i32,
    pub laporan: Value,
    pub created_at: Ts,
}

impl From<&kejuaraan::Model> for KejuaraanView {
    fn from(k: &kejuaraan::Model) -> Self {
        Self {
            id: k.pid,
            nama_ajang: k.nama_ajang.clone(),
            jenis_penyelenggaraan: k.jenis_penyelenggaraan.clone(),
            level: k.level.clone(),
            kategori: k.kategori.clone(),
            bentuk: k.bentuk.clone(),
            tempat: k.tempat.clone(),
            url_ajang: k.url_ajang.clone(),
            tahun: k.tahun,
            laporan: k.laporan.clone(),
            created_at: k.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct InstitusiView {
    pub tahun: i32,
    pub status: String,
    pub indikator: Value,
    pub jumlah_penerima_beasiswa_non_apbn: i32,
    pub level_kelembagaan: Option<i16>,
    pub total_anggaran_pt: i64,
    pub total_anggaran_kemahasiswaan: i64,
    pub updated_at: Option<Ts>,
}

impl InstitusiView {
    #[must_use]
    pub fn empty(tahun: i32) -> Self {
        Self {
            tahun,
            status: "DRAFT".to_string(),
            indikator: Value::Array(vec![]),
            jumlah_penerima_beasiswa_non_apbn: 0,
            level_kelembagaan: None,
            total_anggaran_pt: 0,
            total_anggaran_kemahasiswaan: 0,
            updated_at: None,
        }
    }
}

impl From<&institusi_reports::Model> for InstitusiView {
    fn from(r: &institusi_reports::Model) -> Self {
        Self {
            tahun: r.tahun,
            status: r.status.clone(),
            indikator: r.indikator.clone(),
            jumlah_penerima_beasiswa_non_apbn: r.jumlah_penerima_beasiswa_non_apbn,
            level_kelembagaan: r.level_kelembagaan,
            total_anggaran_pt: r.total_anggaran_pt,
            total_anggaran_kemahasiswaan: r.total_anggaran_kemahasiswaan,
            updated_at: Some(r.updated_at),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DocumentView {
    pub id: Uuid,
    pub record_type: String,
    pub record_ref: String,
    pub document_type: String,
    pub tahun: i32,
    pub original_filename: String,
    pub public_url: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub checksum_sha256: String,
    pub is_locked: bool,
    pub created_at: Ts,
}

impl From<&documents::Model> for DocumentView {
    fn from(d: &documents::Model) -> Self {
        Self {
            id: d.pid,
            record_type: d.record_type.clone(),
            record_ref: d.record_ref.clone(),
            document_type: d.document_type.clone(),
            tahun: d.tahun,
            original_filename: d.original_filename.clone(),
            public_url: d.public_url.clone(),
            mime_type: d.mime_type.clone(),
            size_bytes: d.size_bytes,
            checksum_sha256: d.checksum_sha256.clone(),
            is_locked: d.is_locked,
            created_at: d.created_at,
        }
    }
}

/// Status koneksi SIMKATMAWA. Tidak pernah memuat password maupun token.
#[derive(Debug, Serialize)]
pub struct CredentialStatusView {
    pub configured: bool,
    pub api_url: Option<String>,
    pub email: Option<String>,
    pub is_connected: bool,
    pub last_checked_at: Option<Ts>,
    pub last_error: Option<String>,
    pub token_expires_at: Option<Ts>,
}

impl CredentialStatusView {
    #[must_use]
    pub fn from_model(c: Option<&simkatmawa_credentials::Model>) -> Self {
        c.map_or(
            Self {
                configured: false,
                api_url: None,
                email: None,
                is_connected: false,
                last_checked_at: None,
                last_error: None,
                token_expires_at: None,
            },
            |c| Self {
                configured: true,
                api_url: Some(c.api_url.clone()),
                email: Some(c.email.clone()),
                is_connected: c.is_connected,
                last_checked_at: c.last_checked_at,
                last_error: c.last_error.clone(),
                token_expires_at: c.token_expires_at,
            },
        )
    }
}

#[derive(Debug, Serialize)]
pub struct SubmissionLogView {
    pub id: Uuid,
    pub record_id: i64,
    pub kind: String,
    pub attempt: i32,
    pub outcome: String,
    pub http_status: Option<i32>,
    pub request_summary: Value,
    pub response_summary: Value,
    pub error: Option<String>,
    pub created_at: Ts,
}

impl From<&submission_logs::Model> for SubmissionLogView {
    fn from(l: &submission_logs::Model) -> Self {
        Self {
            id: l.pid,
            record_id: l.record_id,
            kind: l.kind.clone(),
            attempt: l.attempt,
            outcome: l.outcome.clone(),
            http_status: l.http_status,
            request_summary: l.request_summary.clone(),
            response_summary: l.response_summary.clone(),
            error: l.error.clone(),
            created_at: l.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AuditView {
    pub id: i64,
    pub actor_email: Option<String>,
    pub actor_role: Option<String>,
    pub action: String,
    pub entity: String,
    pub entity_ref: Option<String>,
    pub outcome: String,
    pub ip: Option<String>,
    pub request_id: Option<String>,
    pub detail: Value,
    pub hash: String,
    pub created_at: Ts,
}

impl From<&audit_logs::Model> for AuditView {
    fn from(a: &audit_logs::Model) -> Self {
        Self {
            id: a.id,
            actor_email: a.actor_email.clone(),
            actor_role: a.actor_role.clone(),
            action: a.action.clone(),
            entity: a.entity.clone(),
            entity_ref: a.entity_ref.clone(),
            outcome: a.outcome.clone(),
            ip: a.ip.clone(),
            request_id: a.request_id.clone(),
            detail: a.detail.clone(),
            hash: a.hash.clone(),
            created_at: a.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct MappingView {
    pub group_name: String,
    pub internal_value: String,
    pub simkatmawa_code: String,
    pub label: String,
    pub is_override: bool,
}

impl MappingView {
    #[must_use]
    pub fn from_override(m: &enum_mappings::Model) -> Self {
        Self {
            group_name: m.group_name.clone(),
            internal_value: m.internal_value.clone(),
            simkatmawa_code: m.simkatmawa_code.clone(),
            label: m.label.clone(),
            is_override: true,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct SyncRunView {
    pub id: Uuid,
    pub kind: String,
    pub triggered_by: String,
    pub status: String,
    pub fetched: i32,
    pub created: i32,
    pub updated: i32,
    pub unchanged: i32,
    pub deactivated: i32,
    pub failed: i32,
    /// Total baris yang diharapkan (untuk bar progres); `None` bila Portal tidak menyebutkannya.
    pub progress_total: Option<i32>,
    pub note: Option<String>,
    pub started_at: Ts,
    pub finished_at: Option<Ts>,
}

impl From<&sync_runs::Model> for SyncRunView {
    fn from(r: &sync_runs::Model) -> Self {
        Self {
            id: r.pid,
            kind: r.kind.clone(),
            triggered_by: r.triggered_by.clone(),
            status: r.status.clone(),
            fetched: r.fetched,
            created: r.created,
            updated: r.updated,
            unchanged: r.unchanged,
            deactivated: r.deactivated,
            failed: r.failed,
            progress_total: r.progress_total,
            note: r.note.clone(),
            started_at: r.started_at,
            finished_at: r.finished_at,
        }
    }
}

/// Baris cache mahasiswa dari Portal untuk halaman Pengaturan (admin).
#[derive(Debug, Serialize)]
pub struct MasterStudentView {
    pub nim: String,
    pub nama: String,
    pub email: Option<String>,
    pub prodi: Option<String>,
    pub angkatan: Option<i32>,
    pub is_active: bool,
    pub last_seen_at: Ts,
}

impl From<&master_students::Model> for MasterStudentView {
    fn from(s: &master_students::Model) -> Self {
        Self {
            nim: s.nim.clone(),
            nama: s.full_name.clone(),
            email: s.email.clone(),
            prodi: s.study_program.clone(),
            angkatan: s.cohort_year,
            is_active: s.is_active,
            last_seen_at: s.last_seen_at,
        }
    }
}

/// Baris cache pegawai/dosen dari Portal untuk halaman Pengaturan (admin).
#[derive(Debug, Serialize)]
pub struct MasterEmployeeView {
    pub nip: String,
    pub nuptk: Option<String>,
    pub nama: String,
    pub email: Option<String>,
    pub unit: Option<String>,
    pub jabatan: Option<String>,
    pub is_active: bool,
    pub last_seen_at: Ts,
}

impl From<&master_employees::Model> for MasterEmployeeView {
    fn from(e: &master_employees::Model) -> Self {
        Self {
            nip: e.nip.clone(),
            nuptk: e.nuptk.clone(),
            nama: e.full_name.clone(),
            email: e.email.clone(),
            unit: e.work_unit.clone(),
            jabatan: e.position.clone(),
            is_active: e.is_active,
            last_seen_at: e.last_seen_at,
        }
    }
}
