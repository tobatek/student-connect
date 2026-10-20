//! Klien Portal SSO: tukar kode (`/api/sso/verify`), cek sesi (`/api/sso/session-status`),
//! dan tarik data master (`/api/master/*`). Hanya backend yang memanggilnya.
//!
//! Pengaman: host dari allowlist, tanpa redirect, timeout, batas ukuran respons, retry dengan
//! backoff untuk gangguan sementara. Isi respons (data pribadi) tidak pernah masuk pesan galat.

use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};
use url::Url;

use crate::{
    security::sso_crypto::{Envelope, EnvelopeKey},
    settings::{MasterSyncSettings, SsoSettings},
};

const MAX_ENVELOPE_BYTES: usize = 64 * 1024;
const MAX_MASTER_PAGE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug)]
pub enum PortalError {
    /// 401/403: token aplikasi ditolak, atau amplop gagal diautentikasi.
    Auth,
    /// Kode tidak valid / kedaluwarsa / sudah terpakai (400, 404, 410, 422).
    InvalidCode,
    /// 4xx lain atau respons tak terduga. Tidak ada gunanya diulang.
    Rejected(String),
    /// Jaringan, timeout, 429, atau 5xx. Aman diulang.
    Transient(String),
}

impl PortalError {
    #[must_use]
    pub fn describe(&self) -> String {
        match self {
            Self::Auth => "Portal menolak token aplikasi atau amplop tidak valid.".to_string(),
            Self::InvalidCode => "Kode otorisasi tidak valid, kedaluwarsa, atau sudah dipakai.".to_string(),
            Self::Rejected(m) => format!("Portal menolak permintaan: {m}"),
            Self::Transient(m) => format!("Gangguan sementara pada Portal: {m}"),
        }
    }

    const fn retryable(&self) -> bool {
        matches!(self, Self::Transient(_))
    }
}

/// Identitas pengguna dari `/api/sso/verify`.
#[derive(Debug, Clone, Deserialize)]
pub struct Identity {
    pub id: uuid::Uuid,
    pub email: String,
    pub name: String,
    /// `student` atau `staff`.
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub nim: Option<String>,
    #[serde(default)]
    pub nip: Option<String>,
    #[serde(default)]
    pub roles: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct SessionStatus {
    active: bool,
}

/// Satu halaman data master: baris mentah + info paginasi.
#[derive(Debug)]
pub struct MasterPage {
    pub rows: Vec<Value>,
    /// `true` bila Portal menyatakan masih ada halaman berikutnya.
    pub has_more: bool,
    /// Total baris seluruh halaman, bila Portal menyebutkannya (`meta.total` / `total`).
    pub total: Option<u64>,
    /// `false` bila respons tanpa petunjuk paginasi sama sekali (Portal bisa saja mengirim semua data sekaligus).
    pub has_pagination_hints: bool,
}

#[derive(Clone, Copy, Debug)]
pub enum MasterKind {
    Students,
    Employees,
}

impl MasterKind {
    #[must_use]
    pub const fn path(self) -> &'static str {
        match self {
            Self::Students => "/api/master/students",
            Self::Employees => "/api/master/employees",
        }
    }

    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Students => "students",
            Self::Employees => "employees",
        }
    }
}

pub struct Client {
    http: reqwest::Client,
    base: Url,
    app_token: String,
    key: EnvelopeKey,
}

impl Client {
    /// # Errors
    /// Pesan galat bila URL ditolak allowlist atau klien HTTP gagal dibuat.
    pub fn new(settings: &SsoSettings) -> Result<Self, String> {
        let base = if settings.allow_insecure_dev {
            Url::parse(settings.api_url().trim()).map_err(|_| "URL Portal tidak valid".to_string())?
        } else {
            crate::security::url_guard::outbound_api(settings.api_url(), &settings.allowed_hosts)
                .map_err(ToString::to_string)?
        };
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(settings.timeout_seconds))
            .connect_timeout(Duration::from_secs(5))
            .user_agent("StudentConnect/0.1 (sso-client)")
            .https_only(!settings.allow_insecure_dev)
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            http,
            base,
            app_token: settings.app_token.clone(),
            key: EnvelopeKey::from_app_token(&settings.app_token),
        })
    }

    fn url(&self, path: &str) -> Result<Url, PortalError> {
        self.base.join(path).map_err(|e| PortalError::Rejected(e.to_string()))
    }

    async fn read_limited(resp: reqwest::Response, limit: usize) -> Result<(u16, Vec<u8>), PortalError> {
        let status = resp.status().as_u16();
        if resp.content_length().is_some_and(|l| l as usize > limit) {
            return Err(PortalError::Transient("respons terlalu besar".into()));
        }
        let bytes = resp.bytes().await.map_err(|e| PortalError::Transient(e.without_url().to_string()))?;
        if bytes.len() > limit {
            return Err(PortalError::Transient("respons terlalu besar".into()));
        }
        Ok((status, bytes.to_vec()))
    }

    fn classify(status: u16) -> PortalError {
        match status {
            401 | 403 => PortalError::Auth,
            400 | 404 | 410 | 422 => PortalError::InvalidCode,
            408 | 425 | 429 | 500..=599 => PortalError::Transient(format!("HTTP {status}")),
            other => PortalError::Rejected(format!("HTTP {other}")),
        }
    }

    /// Kirim payload terenkripsi, buka balasan terenkripsi.
    async fn encrypted_call(&self, path: &str, payload: &Value) -> Result<Vec<u8>, PortalError> {
        let plaintext = serde_json::to_vec(payload).map_err(|e| PortalError::Rejected(e.to_string()))?;
        let envelope = self.key.seal(&plaintext).map_err(|_| PortalError::Auth)?;
        let resp = self
            .http
            .post(self.url(path)?)
            .bearer_auth(&self.app_token)
            .header("Accept", "application/json")
            .json(&envelope)
            .send()
            .await
            .map_err(|e| PortalError::Transient(e.without_url().to_string()))?;
        let (status, body) = Self::read_limited(resp, MAX_ENVELOPE_BYTES).await?;
        if !(200..300).contains(&status) {
            return Err(Self::classify(status));
        }
        let reply: Envelope = serde_json::from_slice(&body).map_err(|_| PortalError::Auth)?;
        // Tag tidak cocok = dipalsukan atau kunci salah (kontrak: perlakukan sebagai tidak sah).
        self.key.open(&reply).map_err(|_| PortalError::Auth)
    }

    /// Tukar kode otorisasi (sekali pakai, 60 detik) menjadi identitas. Tidak diulang otomatis:
    /// kode sudah terpakai begitu Portal menerimanya.
    ///
    /// # Errors
    /// `PortalError` sesuai klasifikasi.
    pub async fn verify(&self, code: &str) -> Result<Identity, PortalError> {
        let payload = json!({
            "code": code,
            "nonce": uuid::Uuid::new_v4().to_string(),
            "timestamp": chrono::Utc::now().timestamp(),
        });
        let plain = self.encrypted_call("/api/sso/verify", &payload).await?;
        serde_json::from_slice(&plain).map_err(|_| PortalError::Rejected("identitas Portal tidak berbentuk benar".into()))
    }

    /// `true` bila pengguna masih aktif di Portal (belum kena idle timeout).
    ///
    /// # Errors
    /// `PortalError` sesuai klasifikasi.
    pub async fn session_active(&self, email: &str) -> Result<bool, PortalError> {
        let payload = json!({
            "email": email,
            "nonce": uuid::Uuid::new_v4().to_string(),
            "timestamp": chrono::Utc::now().timestamp(),
        });
        let plain = self.encrypted_call("/api/sso/session-status", &payload).await?;
        let status: SessionStatus = serde_json::from_slice(&plain)
            .map_err(|_| PortalError::Rejected("status sesi Portal tidak berbentuk benar".into()))?;
        Ok(status.active)
    }

    async fn master_once(
        &self,
        kind: MasterKind,
        page: u32,
        per_page: u32,
        updated_since: Option<&str>,
    ) -> Result<MasterPage, PortalError> {
        let mut query = vec![("page", page.to_string()), ("per_page", per_page.to_string())];
        if let Some(since) = updated_since {
            query.push(("updated_since", since.to_string()));
        }
        let resp = self
            .http
            .get(self.url(kind.path())?)
            .bearer_auth(&self.app_token)
            .header("Accept", "application/json")
            .query(&query)
            .send()
            .await
            .map_err(|e| PortalError::Transient(e.without_url().to_string()))?;
        let retry_after = resp
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());
        let (status, body) = Self::read_limited(resp, MAX_MASTER_PAGE_BYTES).await?;
        if !(200..300).contains(&status) {
            return Err(match (status, retry_after) {
                (429, Some(secs)) => PortalError::Transient(format!("HTTP 429 (retry-after {secs}s)")),
                _ => Self::classify(status),
            });
        }
        parse_master_page(&body, page)
    }

    /// Ambil satu halaman dengan retry + backoff eksponensial (jitter) untuk gangguan sementara.
    ///
    /// # Errors
    /// Galat terakhir bila semua percobaan habis, atau galat permanen langsung.
    pub async fn master_page(
        &self,
        kind: MasterKind,
        page: u32,
        sync: &MasterSyncSettings,
        updated_since: Option<&str>,
    ) -> Result<MasterPage, PortalError> {
        let mut attempt = 0u32;
        loop {
            attempt += 1;
            match self.master_once(kind, page, sync.page_size, updated_since).await {
                Ok(p) => return Ok(p),
                Err(e) if e.retryable() && attempt < sync.max_attempts => {
                    let backoff = backoff_delay(sync.base_backoff_ms, attempt);
                    tracing::warn!(kind = kind.label(), page, attempt, ?backoff, "halaman master gagal, mencoba lagi");
                    tokio::time::sleep(backoff).await;
                }
                Err(e) => return Err(e),
            }
        }
    }
}

#[must_use]
pub fn backoff_delay(base_ms: u64, attempt: u32) -> Duration {
    let exp = base_ms.saturating_mul(1u64 << attempt.saturating_sub(1).min(10));
    let jitter = u64::from(uuid::Uuid::new_v4().as_bytes()[0]) * base_ms / 255 / 2;
    Duration::from_millis(exp.saturating_add(jitter).min(30_000))
}

/// Mendukung bentuk umum: `{"data":[...], "meta":{"current_page","last_page"}}`,
/// `{"data":[...], "last_page":N}`, `{"data":[...], "next_page_url":...}`, atau array polos.
/// Bila tidak ada petunjuk paginasi, halaman penuh dianggap masih ada lanjutannya
/// (dihentikan oleh halaman kosong).
fn parse_master_page(body: &[u8], page: u32) -> Result<MasterPage, PortalError> {
    let value: Value = serde_json::from_slice(body)
        .map_err(|_| PortalError::Rejected("respons master bukan JSON".into()))?;
    let (rows, root) = match &value {
        Value::Array(rows) => (rows.clone(), None),
        Value::Object(map) => match map.get("data") {
            Some(Value::Array(rows)) => (rows.clone(), Some(&value)),
            _ => return Err(PortalError::Rejected("respons master tidak memuat `data`".into())),
        },
        _ => return Err(PortalError::Rejected("respons master tidak berbentuk benar".into())),
    };
    let last_page = root.and_then(|v| {
        v.pointer("/meta/last_page")
            .or_else(|| v.get("last_page"))
            .and_then(Value::as_u64)
    });
    let next_url = root.and_then(|v| {
        v.get("next_page_url")
            .or_else(|| v.pointer("/links/next"))
            .or_else(|| v.pointer("/meta/next_page_url"))
    });
    let total = root.and_then(|v| v.pointer("/meta/total").or_else(|| v.get("total")).and_then(Value::as_u64));
    let has_pagination_hints = last_page.is_some() || next_url.is_some() || total.is_some();
    let has_more = if let Some(last) = last_page {
        u64::from(page) < last
    } else if let Some(next) = next_url {
        !next.is_null()
    } else {
        !rows.is_empty()
    };
    Ok(MasterPage { rows, has_more, total, has_pagination_hints })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_laravel_meta() {
        let body = br#"{"data":[{"nim":"1"}],"meta":{"current_page":1,"last_page":3}}"#;
        let p = parse_master_page(body, 1).unwrap();
        assert_eq!(p.rows.len(), 1);
        assert!(p.has_more);
        assert!(!parse_master_page(body, 3).unwrap().has_more);
    }

    #[test]
    fn parses_next_url_and_plain_array() {
        let more = br#"{"data":[{"a":1}],"next_page_url":"https://x/y?page=2"}"#;
        assert!(parse_master_page(more, 1).unwrap().has_more);
        let end = br#"{"data":[{"a":1}],"next_page_url":null}"#;
        assert!(!parse_master_page(end, 1).unwrap().has_more);
        assert!(parse_master_page(br#"[{"a":1}]"#, 1).unwrap().has_more);
        assert!(!parse_master_page(br"[]", 2).unwrap().has_more);
    }

    #[test]
    fn reads_total_and_pagination_hints() {
        let with_total = br#"{"data":[{"a":1}],"meta":{"total":1311,"last_page":7}}"#;
        let p = parse_master_page(with_total, 1).unwrap();
        assert_eq!(p.total, Some(1311));
        assert!(p.has_pagination_hints);
        let bare = parse_master_page(br#"[{"a":1}]"#, 1).unwrap();
        assert_eq!(bare.total, None);
        assert!(!bare.has_pagination_hints);
    }

    #[test]
    fn rejects_unexpected_shapes() {
        assert!(parse_master_page(b"not json", 1).is_err());
        assert!(parse_master_page(br#"{"items":[]}"#, 1).is_err());
        assert!(parse_master_page(br#""x""#, 1).is_err());
    }

    #[test]
    fn backoff_grows_and_is_capped() {
        let d1 = backoff_delay(500, 1).as_millis();
        let d3 = backoff_delay(500, 3).as_millis();
        assert!((500..=750).contains(&d1));
        assert!(d3 >= 2000);
        assert!(backoff_delay(500, 30) <= Duration::from_secs(30));
    }

    #[test]
    fn classifies_statuses() {
        assert!(matches!(Client::classify(401), PortalError::Auth));
        assert!(matches!(Client::classify(404), PortalError::InvalidCode));
        assert!(matches!(Client::classify(429), PortalError::Transient(_)));
        assert!(matches!(Client::classify(503), PortalError::Transient(_)));
        assert!(matches!(Client::classify(418), PortalError::Rejected(_)));
    }
}
