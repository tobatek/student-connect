//! Klien API SIMKATMAWA. Hanya backend yang memanggilnya (panduan §3).
//!
//! Pengaman: URL wajib lolos allowlist (`url_guard::outbound_api`), tanpa redirect, timeout,
//! batas ukuran respons, dan pesan galat disaring sehingga payload/token tidak bocor ke log.

use std::time::Duration;

use serde_json::{json, Map, Value};
use url::Url;

use crate::models::{
    enum_mappings,
    records::{Kind, Model as Record},
};

/// Dokumentasi tidak menyebut masa berlaku token; asumsi konservatif lalu login ulang saat 401.
pub const ASSUMED_TOKEN_TTL_MINUTES: i64 = 50;
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;

#[derive(Debug)]
pub enum CallError {
    /// 401/403: token ditolak.
    Auth,
    /// 4xx lain: data ditolak SIMKATMAWA; tidak ada gunanya diulang tanpa perbaikan.
    Rejected { status: u16, message: String },
    /// Jaringan, timeout, 429, atau 5xx: aman diulang.
    Transient(String),
    /// Data mungkin SUDAH diterima SIMKATMAWA (timeout/koneksi putus/5xx setelah terkirim).
    /// TIDAK boleh diulang otomatis: mengirim lagi bisa membuat data ganda.
    Uncertain(String),
}

impl CallError {
    #[must_use]
    pub fn describe(&self) -> String {
        match self {
            Self::Auth => "Token SIMKATMAWA ditolak (401/403).".to_string(),
            Self::Rejected { status, message } => format!("SIMKATMAWA menolak data (HTTP {status}): {message}"),
            Self::Transient(m) => format!("Gangguan sementara: {m}"),
            Self::Uncertain(m) => format!(
                "Hasil pengiriman tidak pasti ({m}). Periksa dulu di SIMKATMAWA apakah data sudah masuk sebelum kirim ulang."
            ),
        }
    }
}

#[derive(Debug)]
pub struct LoginOk {
    pub token: String,
    pub kode_pt: Option<String>,
}

#[derive(Debug)]
pub struct SubmitOk {
    pub http_status: u16,
    pub simkatmawa_id: String,
    pub kode_pt: Option<String>,
    pub tahun: Option<String>,
    pub message: String,
}

pub struct Client {
    http: reqwest::Client,
    base: Url,
}

fn clean_message(value: &Value) -> String {
    let raw = value
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("tanpa pesan");
    raw.chars().filter(|c| !c.is_control()).take(200).collect()
}

fn scalar_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

impl Client {
    /// # Errors
    /// Galat pembuatan klien HTTP.
    pub fn new(base: Url, timeout: Duration) -> Result<Self, String> {
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(timeout)
            .connect_timeout(Duration::from_secs(10))
            .user_agent("StudentConnect/0.1")
            .https_only(true)
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self { http, base })
    }

    async fn read(resp: reqwest::Response) -> Result<(u16, Value), CallError> {
        let status = resp.status().as_u16();
        if resp.content_length().is_some_and(|l| l as usize > MAX_RESPONSE_BYTES) {
            return Err(CallError::Transient("respons terlalu besar".into()));
        }
        let bytes = resp.bytes().await.map_err(|e| CallError::Transient(e.without_url().to_string()))?;
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(CallError::Transient("respons terlalu besar".into()));
        }
        let body = serde_json::from_slice::<Value>(&bytes).unwrap_or(Value::Null);
        Ok((status, body))
    }

    /// `POST /api/login`.
    ///
    /// # Errors
    /// `CallError` sesuai klasifikasi.
    pub async fn login(&self, email: &str, password: &str) -> Result<LoginOk, CallError> {
        let url = self.base.join("/api/login").map_err(|e| CallError::Transient(e.to_string()))?;
        let resp = self
            .http
            .post(url)
            .header("Accept", "application/json")
            .json(&json!({"email": email, "password": password}))
            .send()
            .await
            .map_err(|e| CallError::Transient(e.without_url().to_string()))?;
        let (status, body) = Self::read(resp).await?;
        match status {
            200..=299 => {
                let token = body.get("token").and_then(Value::as_str).filter(|t| !t.is_empty());
                match (body.get("success").and_then(Value::as_bool), token) {
                    (Some(true), Some(token)) => Ok(LoginOk {
                        token: token.to_string(),
                        kode_pt: body.get("kode_pt").and_then(scalar_to_string),
                    }),
                    _ => Err(CallError::Auth),
                }
            }
            401 | 403 | 422 => Err(CallError::Auth),
            429 | 500..=599 => Err(CallError::Transient(format!("HTTP {status}"))),
            other => Err(CallError::Rejected { status: other, message: clean_message(&body) }),
        }
    }

    /// `POST {path}` dengan bearer token.
    ///
    /// # Errors
    /// `CallError` sesuai klasifikasi.
    pub async fn submit(&self, path: &str, token: &str, payload: &Value) -> Result<SubmitOk, CallError> {
        let url = self.base.join(path).map_err(|e| CallError::Transient(e.to_string()))?;
        let resp = self
            .http
            .post(url)
            .bearer_auth(token)
            .header("Accept", "application/json")
            .json(payload)
            .send()
            .await
            // Gagal tersambung = permintaan belum pernah sampai (aman diulang). Selain itu
            // (timeout, koneksi putus) server bisa saja sudah memprosesnya.
            .map_err(|e| {
                let never_sent = e.is_connect();
                let reason = e.without_url().to_string();
                if never_sent { CallError::Transient(reason) } else { CallError::Uncertain(reason) }
            })?;
        let (status, body) = match Self::read(resp).await {
            Ok(r) => r,
            // Badan balasan gagal dibaca: status sukses/gagal tidak diketahui.
            Err(CallError::Transient(m)) => return Err(CallError::Uncertain(m)),
            Err(e) => return Err(e),
        };
        match status {
            200..=299 => {
                let ok = body.get("status").and_then(Value::as_bool).unwrap_or(false);
                let data = body.get("data").cloned().unwrap_or(Value::Null);
                match (ok, data.get("id").and_then(scalar_to_string)) {
                    (true, Some(id)) => Ok(SubmitOk {
                        http_status: status,
                        simkatmawa_id: id,
                        kode_pt: data.get("kode_pt").and_then(scalar_to_string),
                        tahun: data.get("tahun").and_then(scalar_to_string),
                        message: clean_message(&body),
                    }),
                    _ => Err(CallError::Rejected { status, message: clean_message(&body) }),
                }
            }
            other => Err(classify_submit_failure(other, &body)),
        }
    }
}

/// Kegagalan HTTP pada pengiriman data. 429/503 berarti belum diproses (aman diulang);
/// 5xx lain bisa terjadi setelah data tersimpan, jadi hasilnya tidak pasti.
fn classify_submit_failure(status: u16, body: &Value) -> CallError {
    match status {
        401 | 403 => CallError::Auth,
        429 | 503 => CallError::Transient(format!("HTTP {status}")),
        500..=599 => CallError::Uncertain(format!("HTTP {status}")),
        other => CallError::Rejected { status: other, message: clean_message(body) },
    }
}

fn mapped(overrides: &[enum_mappings::Model], group: &str, internal: &str) -> String {
    enum_mappings::Model::resolve(overrides, group, internal)
}

/// Menyusun payload sesuai panduan §3.2-3.4. `kode_pt` dan `tahun` diisi server SIMKATMAWA.
#[must_use]
pub fn build_payload(record: &Record, overrides: &[enum_mappings::Model]) -> Value {
    let kind = Kind::parse(&record.kind);
    let mut p = Map::new();
    p.insert("level".into(), json!(mapped(overrides, "level", &record.level)));
    p.insert("penyelenggara".into(), json!(record.penyelenggara));
    p.insert("url_peserta".into(), json!(record.url_peserta));
    p.insert("url_sertifikat".into(), json!(record.url_sertifikat));
    p.insert("tgl_sertifikat".into(), json!(record.tgl_sertifikat.format("%Y-%m-%d").to_string()));
    for (key, value) in [
        ("url_foto_upp", &record.url_foto_upp),
        ("url_dokumen_undangan", &record.url_dokumen_undangan),
        ("keterangan", &record.keterangan),
    ] {
        if let Some(v) = value {
            p.insert(key.into(), json!(v));
        }
    }
    let extra = |key: &str| record.extra.get(key).and_then(Value::as_str).unwrap_or("").to_string();
    match kind {
        Some(Kind::PrestasiMandiri) => {
            p.insert("lomba".into(), json!(record.nama));
            p.insert("kategori".into(), json!(mapped(overrides, "kategori", &extra("kategori"))));
            p.insert("cabang".into(), json!(extra("cabang")));
            p.insert("peringkat".into(), json!(mapped(overrides, "peringkat", &extra("peringkat"))));
            p.insert("jumlah_unit_peserta".into(), json!(extra("jumlah_unit_peserta")));
            p.insert("kelompok_prestasi".into(), json!(mapped(overrides, "kelompok_prestasi", &extra("kelompok_prestasi"))));
            p.insert("bentuk".into(), json!(mapped(overrides, "bentuk", &extra("bentuk"))));
        }
        Some(Kind::Rekognisi) => {
            p.insert("nama".into(), json!(record.nama));
            p.insert("jenis".into(), json!(mapped(overrides, "jenis", &extra("jenis"))));
        }
        _ => {
            p.insert("nama".into(), json!(record.nama));
        }
    }
    p.insert("mahasiswa".into(), record.mahasiswa.clone());
    let dosen: Vec<Value> = record
        .dosen
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|d| {
                    let mut o = Map::new();
                    o.insert("nuptk".into(), d.get("nuptk").cloned().unwrap_or(Value::Null));
                    o.insert("nama".into(), d.get("nama").cloned().unwrap_or(Value::Null));
                    if let Some(url) = d.get("url_surat_tugas").filter(|v| v.is_string()) {
                        o.insert("url_surat_tugas".into(), url.clone());
                    }
                    Value::Object(o)
                })
                .collect()
        })
        .unwrap_or_default();
    p.insert("dosen".into(), Value::Array(dosen));
    Value::Object(p)
}

/// Ringkasan aman untuk `submission_logs` (tanpa URL penuh maupun nama peserta).
#[must_use]
pub fn summarize(payload: &Value) -> Value {
    json!({
        "fields": payload.as_object().map(|o| o.keys().cloned().collect::<Vec<_>>()).unwrap_or_default(),
        "mahasiswa": payload.get("mahasiswa").and_then(Value::as_array).map_or(0, Vec::len),
        "dosen": payload.get("dosen").and_then(Value::as_array).map_or(0, Vec::len),
        "level": payload.get("level"),
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn submit_failures_never_auto_retry_when_outcome_is_unknown() {
        let body = serde_json::json!({});
        assert!(matches!(super::classify_submit_failure(429, &body), super::CallError::Transient(_)));
        assert!(matches!(super::classify_submit_failure(503, &body), super::CallError::Transient(_)));
        for s in [500, 502, 504, 599] {
            assert!(matches!(super::classify_submit_failure(s, &body), super::CallError::Uncertain(_)), "{s}");
        }
        assert!(matches!(super::classify_submit_failure(422, &body), super::CallError::Rejected { .. }));
        assert!(matches!(super::classify_submit_failure(401, &body), super::CallError::Auth));
    }

    use chrono::{NaiveDate, Utc};
    use uuid::Uuid;

    use super::*;

    fn record(kind: &str, extra: Value) -> Record {
        let now = Utc::now().fixed_offset();
        Record {
            created_at: now,
            updated_at: now,
            id: 1,
            pid: Uuid::nil(),
            tenant_id: 1,
            kind: kind.to_string(),
            status: "QUEUED".into(),
            nama: "National Programming Contest".into(),
            level: "NAS".into(),
            penyelenggara: "PT. LOMBA".into(),
            url_peserta: "https://a.id/p".into(),
            url_sertifikat: "https://a.id/s".into(),
            tgl_sertifikat: NaiveDate::from_ymd_opt(2025, 5, 1).unwrap(),
            url_foto_upp: None,
            url_dokumen_undangan: None,
            keterangan: Some("Catatan".into()),
            mahasiswa: json!([{"nim": "51422001", "nama": "Budi"}]),
            dosen: json!([{"nuptk": "511111422001", "nama": "Dosen", "url_surat_tugas": null}]),
            extra,
            simkatmawa_id: None,
            simkatmawa_kode_pt: None,
            simkatmawa_tahun: None,
            sent_at: None,
            last_error: None,
            submission_attempts: 1,
            idempotency_key: Uuid::nil(),
            revision_note: None,
            version: 1,
            created_by: None,
        }
    }

    #[test]
    fn prestasi_mandiri_payload_uses_lomba_and_omits_empty_optionals() {
        let r = record(
            "PRESTASI_MANDIRI",
            json!({"kategori": "RISNOV", "cabang": "Matematika", "peringkat": "JUARA1", "jumlah_unit_peserta": "3", "kelompok_prestasi": "KELOMPOK", "bentuk": "DARING"}),
        );
        let p = build_payload(&r, &[]);
        assert_eq!(p["lomba"], "National Programming Contest");
        assert!(p.get("nama").is_none());
        assert!(p.get("url_foto_upp").is_none());
        assert_eq!(p["tgl_sertifikat"], "2025-05-01");
        assert!(p["dosen"][0].get("url_surat_tugas").is_none());
        assert!(p.get("kode_pt").is_none() && p.get("tahun").is_none());
    }

    #[test]
    fn rekognisi_payload_has_jenis() {
        let p = build_payload(&record("REKOGNISI", json!({"jenis": "SERKOM"})), &[]);
        assert_eq!(p["jenis"], "SERKOM");
        assert_eq!(p["nama"], "National Programming Contest");
    }

    #[test]
    fn summary_never_contains_urls_or_names() {
        let s = summarize(&build_payload(&record("SERTIFIKASI", json!({})), &[])).to_string();
        assert!(!s.contains("https://") && !s.contains("Budi"));
    }
}
