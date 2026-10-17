//! Pengaturan aplikasi bertipe dari blok `settings:` pada `config/<env>.yaml`.
//!
//! Semua rahasia masuk lewat konfigurasi (interpolasi env), tidak ada `std::env::var`
//! di kode aplikasi (ISO/IEC 27001:2022 A.5.17, A.8.24).

use std::collections::BTreeMap;

use loco_rs::{app::AppContext, Error, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    /// Kunci master AES-256 (base64, 32 byte) untuk brankas kredensial SIMKATMAWA.
    pub credential_master_key: String,
    #[serde(default)]
    pub session: SessionSettings,
    #[serde(default)]
    pub login: LoginSettings,
    #[serde(default)]
    pub simkatmawa: SimkatmawaSettings,
    #[serde(default)]
    pub sso: SsoSettings,
    #[serde(default)]
    pub master_sync: MasterSyncSettings,
    pub storage: StorageSettings,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SessionSettings {
    #[serde(default = "d_cookie")]
    pub cookie_name: String,
    #[serde(default = "d_true")]
    pub cookie_secure: bool,
    #[serde(default = "d_idle")]
    pub idle_minutes: i64,
    #[serde(default = "d_abs")]
    pub absolute_hours: i64,
    #[serde(default = "d_max_sessions")]
    pub max_sessions_per_user: u64,
}

impl Default for SessionSettings {
    fn default() -> Self {
        Self {
            cookie_name: d_cookie(),
            cookie_secure: true,
            idle_minutes: d_idle(),
            absolute_hours: d_abs(),
            max_sessions_per_user: d_max_sessions(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoginSettings {
    #[serde(default = "d_attempts")]
    pub max_failed_attempts: i32,
    #[serde(default = "d_lockout")]
    pub lockout_minutes: i64,
    #[serde(default = "d_ip_limit")]
    pub ip_attempts_per_minute: u32,
}

impl Default for LoginSettings {
    fn default() -> Self {
        Self {
            max_failed_attempts: d_attempts(),
            lockout_minutes: d_lockout(),
            ip_attempts_per_minute: d_ip_limit(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct SimkatmawaSettings {
    /// Host yang boleh dihubungi backend (anti-SSRF).
    #[serde(default = "d_hosts")]
    pub allowed_hosts: Vec<String>,
    #[serde(default = "d_api_url")]
    pub default_api_url: String,
    #[serde(default = "d_timeout")]
    pub timeout_seconds: u64,
}

impl Default for SimkatmawaSettings {
    fn default() -> Self {
        Self {
            allowed_hosts: d_hosts(),
            default_api_url: d_api_url(),
            timeout_seconds: d_timeout(),
        }
    }
}

/// Klien SSO Portal. `app_token` adalah rahasia: hanya boleh datang dari env/secret manager.
#[derive(Clone, Deserialize)]
pub struct SsoSettings {
    #[serde(default)]
    pub enabled: bool,
    /// Contoh: `https://portal.kampus.ac.id`.
    #[serde(default)]
    pub portal_base_url: String,
    /// Host Portal yang boleh dihubungi backend (anti-SSRF).
    #[serde(default)]
    pub allowed_hosts: Vec<String>,
    /// UUID aplikasi di halaman admin "Integrasi Aplikasi" Portal.
    #[serde(default)]
    pub client_id: String,
    /// Token aplikasi (ditampilkan sekali oleh Portal). Kunci AES diturunkan darinya.
    #[serde(default)]
    pub app_token: String,
    /// Harus persis salah satu `redirect_uris` terdaftar di Portal.
    #[serde(default)]
    pub redirect_uri: String,
    #[serde(default = "d_sso_timeout")]
    pub timeout_seconds: u64,
    /// Selama rollout aditif, login sandi lokal boleh tetap hidup. Matikan setelah SSO stabil.
    #[serde(default = "d_true")]
    pub password_login_enabled: bool,
    /// Tenant tujuan akun hasil provisioning SSO dan data master.
    #[serde(default)]
    pub tenant_slug: String,
    #[serde(default = "d_state_ttl")]
    pub state_ttl_seconds: i64,
    #[serde(default = "d_post_login")]
    pub post_login_url: String,
    #[serde(default = "d_login_error")]
    pub login_error_url: String,
    /// Kode peran Portal -> peran lokal. SUPER_ADMIN tidak boleh dipetakan otomatis.
    #[serde(default)]
    pub role_map: BTreeMap<String, String>,
    #[serde(default = "d_student_role")]
    pub default_student_role: String,
    /// Hanya non-produksi: izinkan Portal tiruan lewat http://localhost.
    #[serde(default)]
    pub allow_insecure_dev: bool,
    /// Task `sso:sessions-check` mencabut sesi lokal bila Portal menyatakan pengguna tidak aktif.
    #[serde(default = "d_true")]
    pub session_check_enabled: bool,
}

impl Default for SsoSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            portal_base_url: String::new(),
            allowed_hosts: Vec::new(),
            client_id: String::new(),
            app_token: String::new(),
            redirect_uri: String::new(),
            timeout_seconds: d_sso_timeout(),
            password_login_enabled: true,
            tenant_slug: String::new(),
            state_ttl_seconds: d_state_ttl(),
            post_login_url: d_post_login(),
            login_error_url: d_login_error(),
            role_map: BTreeMap::new(),
            default_student_role: d_student_role(),
            allow_insecure_dev: false,
            session_check_enabled: true,
        }
    }
}

impl std::fmt::Debug for SsoSettings {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SsoSettings")
            .field("enabled", &self.enabled)
            .field("portal_base_url", &self.portal_base_url)
            .field("client_id", &self.client_id)
            .field("app_token", &"<redacted>")
            .field("redirect_uri", &self.redirect_uri)
            .finish_non_exhaustive()
    }
}

/// Sinkronisasi data master mahasiswa/pegawai dari Portal.
#[derive(Debug, Clone, Deserialize)]
pub struct MasterSyncSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "d_page_size")]
    pub page_size: u32,
    /// Pengaman terhadap pagination tak berujung.
    #[serde(default = "d_max_pages")]
    pub max_pages: u32,
    #[serde(default = "d_attempts_sync")]
    pub max_attempts: u32,
    #[serde(default = "d_backoff_ms")]
    pub base_backoff_ms: u64,
    /// Jeda antar halaman agar tidak membebani Portal.
    #[serde(default = "d_page_delay_ms")]
    pub page_delay_ms: u64,
    /// Bila lebih dari persentase ini data aktif akan hilang dari sumber, penonaktifan dibatalkan.
    #[serde(default = "d_max_deactivate")]
    pub max_deactivate_percent: u32,
}

impl Default for MasterSyncSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            page_size: d_page_size(),
            max_pages: d_max_pages(),
            max_attempts: d_attempts_sync(),
            base_backoff_ms: d_backoff_ms(),
            page_delay_ms: d_page_delay_ms(),
            max_deactivate_percent: d_max_deactivate(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct StorageSettings {
    /// `local` (pengembangan) atau `r2` (Cloudflare R2 / S3-compatible).
    #[serde(default = "d_driver")]
    pub driver: String,
    #[serde(default)]
    pub bucket: String,
    #[serde(default)]
    pub endpoint: String,
    #[serde(default = "d_region")]
    pub region: String,
    #[serde(default)]
    pub access_key_id: String,
    #[serde(default)]
    pub secret_access_key: String,
    /// Basis URL publik permanen untuk dokumen bukti.
    pub public_base_url: String,
    #[serde(default = "d_upload_mb")]
    pub max_upload_mb: u64,
}

fn d_sso_timeout() -> u64 {
    10
}
fn d_state_ttl() -> i64 {
    600
}
fn d_post_login() -> String {
    "/".to_string()
}
fn d_login_error() -> String {
    "/masuk".to_string()
}
fn d_student_role() -> String {
    "MAHASISWA".to_string()
}
fn d_page_size() -> u32 {
    200
}
fn d_max_pages() -> u32 {
    500
}
fn d_attempts_sync() -> u32 {
    4
}
fn d_backoff_ms() -> u64 {
    500
}
fn d_page_delay_ms() -> u64 {
    200
}
fn d_max_deactivate() -> u32 {
    30
}
fn d_cookie() -> String {
    "__Host-sc_session".to_string()
}
fn d_true() -> bool {
    true
}
fn d_idle() -> i64 {
    30
}
fn d_abs() -> i64 {
    8
}
fn d_max_sessions() -> u64 {
    5
}
fn d_attempts() -> i32 {
    5
}
fn d_lockout() -> i64 {
    15
}
fn d_ip_limit() -> u32 {
    20
}
fn d_hosts() -> Vec<String> {
    vec!["simkatmawa.kemdiktisaintek.go.id".to_string()]
}
fn d_api_url() -> String {
    "https://simkatmawa.kemdiktisaintek.go.id".to_string()
}
fn d_timeout() -> u64 {
    20
}
fn d_driver() -> String {
    "local".to_string()
}
fn d_region() -> String {
    "auto".to_string()
}
fn d_upload_mb() -> u64 {
    15
}

/// Brankas kredensial yang dibangun saat boot (`Hooks::after_context`).
///
/// # Errors
/// Gagal bila brankas belum diinisialisasi.
pub fn vault(ctx: &AppContext) -> Result<std::sync::Arc<crate::security::vault::Vault>> {
    ctx.shared_store
        .get::<std::sync::Arc<crate::security::vault::Vault>>()
        .ok_or_else(|| Error::Message("brankas kredensial belum diinisialisasi".into()))
}

impl Settings {
    /// Mengambil pengaturan tervalidasi dari `shared_store` (diisi saat boot).
    ///
    /// # Errors
    /// Gagal bila konfigurasi tidak valid.
    pub fn get(ctx: &AppContext) -> Result<Self> {
        ctx.shared_store
            .get::<Self>()
            .map_or_else(|| Self::load(ctx), Ok)
    }

    /// Membaca dan memvalidasi blok `settings` dari konfigurasi.
    ///
    /// # Errors
    /// Gagal bila blok hilang, salah bentuk, atau kunci master tidak valid.
    pub fn load(ctx: &AppContext) -> Result<Self> {
        let raw = ctx
            .config
            .settings
            .clone()
            .ok_or_else(|| Error::Message("blok `settings` tidak ada di konfigurasi".into()))?;
        let settings: Self = serde_json::from_value(raw)
            .map_err(|e| Error::Message(format!("konfigurasi `settings` tidak valid: {e}")))?;
        settings.validate(ctx.environment.to_string().as_str())?;
        Ok(settings)
    }

    fn validate(&self, environment: &str) -> Result<()> {
        crate::security::vault::Vault::from_base64(&self.credential_master_key)
            .map_err(|e| Error::Message(format!("credential_master_key tidak valid: {e}")))?;
        if environment == "production" {
            if !self.session.cookie_secure {
                return Err(Error::Message("production wajib cookie_secure=true".into()));
            }
            if !self.storage.public_base_url.starts_with("https://") {
                return Err(Error::Message("production wajib public_base_url https".into()));
            }
            if self.storage.driver == "local" {
                return Err(Error::Message("production tidak boleh storage local".into()));
            }
        }
        if self.storage.max_upload_mb == 0 || self.storage.max_upload_mb > 50 {
            return Err(Error::Message("max_upload_mb harus 1-50".into()));
        }
        self.sso.validate(environment)?;
        if self.master_sync.enabled && !self.sso.enabled {
            return Err(Error::Message("master_sync memerlukan sso.enabled=true (token aplikasi sama)".into()));
        }
        if self.master_sync.page_size == 0 || self.master_sync.page_size > 1000 || self.master_sync.max_attempts == 0 {
            return Err(Error::Message("master_sync: page_size 1-1000 dan max_attempts >= 1".into()));
        }
        if self.master_sync.max_deactivate_percent > 100 {
            return Err(Error::Message("master_sync.max_deactivate_percent maksimal 100".into()));
        }
        Ok(())
    }
}

impl SsoSettings {
    fn validate(&self, environment: &str) -> Result<()> {
        use crate::security::roles::Role;

        for (portal_role, local) in &self.role_map {
            match Role::parse(local) {
                None => return Err(Error::Message(format!("sso.role_map: peran lokal `{local}` tidak dikenal"))),
                Some(Role::SuperAdmin) => {
                    return Err(Error::Message(format!(
                        "sso.role_map: `{portal_role}` tidak boleh dipetakan ke SUPER_ADMIN"
                    )))
                }
                Some(_) => {}
            }
        }
        if matches!(Role::parse(&self.default_student_role), None | Some(Role::SuperAdmin)) {
            return Err(Error::Message("sso.default_student_role tidak valid".into()));
        }
        if !self.enabled {
            return Ok(());
        }
        if self.allow_insecure_dev && environment == "production" {
            return Err(Error::Message("production tidak boleh sso.allow_insecure_dev".into()));
        }
        if self.client_id.trim().is_empty() || self.tenant_slug.trim().is_empty() {
            return Err(Error::Message("sso.client_id dan sso.tenant_slug wajib diisi".into()));
        }
        if self.app_token.len() < 32 {
            return Err(Error::Message("sso.app_token wajib diisi dari secret manager (min 32 karakter)".into()));
        }
        if self.allowed_hosts.is_empty() {
            return Err(Error::Message("sso.allowed_hosts wajib berisi host Portal".into()));
        }
        if !self.allow_insecure_dev {
            crate::security::url_guard::outbound_api(&self.portal_base_url, &self.allowed_hosts)
                .map_err(|m| Error::Message(format!("sso.portal_base_url: {m}")))?;
        }
        let redirect = url::Url::parse(&self.redirect_uri)
            .map_err(|_| Error::Message("sso.redirect_uri tidak valid".into()))?;
        if redirect.path() != "/api/sso/callback" || redirect.query().is_some() || redirect.fragment().is_some() {
            return Err(Error::Message("sso.redirect_uri harus berakhir tepat di /api/sso/callback".into()));
        }
        if environment == "production" && redirect.scheme() != "https" {
            return Err(Error::Message("production wajib sso.redirect_uri https".into()));
        }
        for (name, value) in [("post_login_url", &self.post_login_url), ("login_error_url", &self.login_error_url)] {
            if !value.starts_with('/') || value.starts_with("//") {
                return Err(Error::Message(format!("sso.{name} harus path lokal")));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use loco_rs::{config::Config, environment::Environment};
    use serial_test::serial;

    use super::*;

    fn load(env: &Environment) -> Settings {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("config");
        let config = Config::from_folder(env, &dir).expect("config termuat");
        serde_json::from_value(config.settings.expect("blok settings")).expect("settings terurai")
    }

    #[test]
    #[serial]
    fn development_config_parses_with_sso_off_by_default() {
        let s = load(&Environment::Development);
        assert!(!s.sso.enabled && !s.master_sync.enabled);
        s.validate("development").unwrap();
    }

    #[test]
    #[serial]
    fn production_config_requires_valid_sso_when_enabled() {
        let set = [
            ("HOST", "https://api.kampus.ac.id"),
            ("CORS_ORIGIN", "https://app.kampus.ac.id"),
            ("DATABASE_URL", "postgres://u:p@localhost/db"),
            ("CREDENTIAL_MASTER_KEY", "ZGV2LW9ubHkta2V5LWRvLW5vdC11c2UtaW4tcHJvZCE="),
            ("R2_BUCKET", "b"),
            ("R2_ENDPOINT", "https://x.r2.cloudflarestorage.com"),
            ("R2_ACCESS_KEY_ID", "k"),
            ("R2_SECRET_ACCESS_KEY", "s"),
            ("R2_PUBLIC_BASE_URL", "https://dokumen.kampus.ac.id"),
        ];
        for (k, v) in set {
            std::env::set_var(k, v);
        }
        // SSO mati: produksi tetap valid tanpa variabel SSO.
        load(&Environment::Production).validate("production").unwrap();

        let sso = [
            ("SSO_ENABLED", "true"),
            ("SSO_PORTAL_BASE_URL", "https://portal.kampus.ac.id"),
            ("SSO_PORTAL_HOST", "portal.kampus.ac.id"),
            ("SSO_CLIENT_ID", "6f1c3b0e-8a52-4c1e-9d55-1d2f6a9b7c10"),
            ("SSO_REDIRECT_URI", "https://app.kampus.ac.id/api/sso/callback"),
            ("SSO_TENANT_SLUG", "ameta"),
        ];
        for (k, v) in sso {
            std::env::set_var(k, v);
        }
        // Tanpa token aplikasi: ditolak.
        std::env::remove_var("SSO_APP_TOKEN");
        assert!(load(&Environment::Production).validate("production").is_err());

        std::env::set_var("SSO_APP_TOKEN", "token-aplikasi-uji-0123456789-abcdefghijklmnop");
        let ok = load(&Environment::Production);
        assert!(ok.sso.enabled);
        ok.validate("production").unwrap();
        assert!(format!("{:?}", ok.sso).contains("<redacted>") && !format!("{:?}", ok.sso).contains("token-aplikasi"));

        // Redirect URI http ditolak di produksi.
        std::env::set_var("SSO_REDIRECT_URI", "http://app.kampus.ac.id/api/sso/callback");
        assert!(load(&Environment::Production).validate("production").is_err());

        for (k, _) in set.iter().chain(sso.iter()) {
            std::env::remove_var(k);
        }
        std::env::remove_var("SSO_APP_TOKEN");
    }

    #[test]
    fn role_map_cannot_grant_super_admin() {
        let mut s = SsoSettings::default();
        s.role_map.insert("rektor".into(), "SUPER_ADMIN".into());
        assert!(s.validate("development").is_err());
        s.role_map.clear();
        s.role_map.insert("dosen".into(), "DOSEN_PEMBINA".into());
        s.validate("development").unwrap();
        s.role_map.insert("x".into(), "TIDAK_ADA".into());
        assert!(s.validate("development").is_err());
    }
}
