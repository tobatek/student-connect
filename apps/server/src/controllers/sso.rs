//! Login lewat Portal SSO: redirect ke Portal, tukar kode di backend, lalu terbitkan sesi lokal.
//!
//! Alur (kontrak di `docs/15_SSO_PORTAL_VALIDASI_SEPARATION_PLAN.md`):
//! 1. `GET /api/sso/login`     -> 303 ke `{portal}/sso/authorize?client_id&redirect_uri&state`.
//! 2. Portal mengalihkan browser ke `GET /api/sso/callback?code&state`.
//! 3. Backend menukar `code` (server-to-server, AES-256-GCM) menjadi identitas.
//! 4. Akun lokal dicocokkan/dibuat; RBAC tetap milik aplikasi ini, bukan Portal.
//!
//! Kontrol: `state` terikat ke cookie browser (anti login-CSRF), cookie state `SameSite=Lax`
//! karena callback adalah navigasi lintas-situs, sesi baru tiap login (anti session fixation),
//! tidak ada nilai dari query yang dipantulkan ke URL tujuan (anti open-redirect), galat ke
//! pengguna berupa kode pendek tanpa detail internal.

use std::time::Duration;

use axum::http::{header, StatusCode};
use chrono::Utc;
use loco_rs::{hash, prelude::*};
use serde::Deserialize;
use serde_json::json;
use subtle::ConstantTimeEq;
use url::Url;
use validator::ValidateEmail;

use crate::{
    integrations::portal::{Client, Identity, PortalError},
    models::{
        audit_logs::{self, Entry, Outcome},
        master_data, sessions, tenants,
        users::{self, NewSsoUser},
    },
    security::{principal::ClientMeta, rate_limit, roles::Role},
    settings::{Settings, SsoSettings},
};

/// Kode galat yang boleh tampil di URL halaman masuk (`?sso_error=`).
mod code {
    pub const DISABLED: &str = "disabled";
    pub const STATE: &str = "state";
    pub const INVALID: &str = "invalid";
    pub const UNAVAILABLE: &str = "unavailable";
    pub const UNREGISTERED: &str = "unregistered";
    pub const INACTIVE: &str = "inactive";
    pub const RATE: &str = "rate";
}

#[derive(Debug, Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

fn state_cookie_name(settings: &Settings) -> String {
    format!("{}_sso", settings.session.cookie_name)
}

/// `SameSite=Lax` (bukan Strict): callback datang dari navigasi lintas-situs Portal, dan cookie
/// Strict tidak akan ikut terkirim sehingga `state` tidak dapat diverifikasi.
fn state_cookie(settings: &Settings, value: &str, max_age: i64) -> String {
    let secure = if settings.session.cookie_secure { "; Secure" } else { "" };
    format!("{}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{secure}", state_cookie_name(settings))
}

fn session_cookie(settings: &Settings, value: &str, max_age: i64) -> String {
    let secure = if settings.session.cookie_secure { "; Secure" } else { "" };
    format!("{}={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age}{secure}", settings.session.cookie_name)
}

fn read_cookie(raw: &str, name: &str) -> Option<String> {
    raw.split(';').find_map(|pair| {
        let (k, v) = pair.trim().split_once('=')?;
        (k == name).then(|| v.to_string())
    })
}

fn redirect(location: &str, cookies: &[String]) -> Result<Response> {
    let mut builder = Response::builder()
        .status(StatusCode::SEE_OTHER)
        .header(header::LOCATION, location)
        .header(header::CACHE_CONTROL, "no-store");
    for cookie in cookies {
        builder = builder.header(header::SET_COOKIE, cookie.as_str());
    }
    builder.body(axum::body::Body::empty()).map_err(|_| Error::InternalServerError)
}

fn failure(settings: &Settings, reason: &str, cookies: &[String]) -> Result<Response> {
    let sep = if settings.sso.login_error_url.contains('?') { '&' } else { '?' };
    redirect(&format!("{}{sep}sso_error={reason}", settings.sso.login_error_url), cookies)
}

async fn audit_anonymous(ctx: &AppContext, meta: &ClientMeta, tenant_id: Option<i64>, outcome: Outcome, detail: serde_json::Value) -> Result<()> {
    audit_logs::Model::record(
        &ctx.db,
        Entry {
            tenant_id,
            actor: None,
            action: "auth.sso_login",
            entity: "session",
            entity_ref: None,
            outcome,
            ip: meta.ip.clone(),
            request_id: meta.request_id.clone(),
            detail,
        },
    )
    .await
    .map_err(Error::Model)?;
    Ok(())
}

/// `GET /api/sso/config`: informasi publik agar SPA tahu tombol apa yang ditampilkan.
#[debug_handler]
async fn config(State(ctx): State<AppContext>) -> Result<Response> {
    let s = Settings::get(&ctx)?;
    format::render().header("cache-control", "no-store").json(json!({
        "enabled": s.sso.enabled,
        "login_url": "/api/sso/login",
        "password_login_enabled": s.sso.password_login_enabled || !s.sso.enabled,
    }))
}

/// `GET /api/sso/login`: mulai alur, set cookie state, alihkan ke Portal.
#[debug_handler]
async fn login(State(ctx): State<AppContext>, meta: ClientMeta) -> Result<Response> {
    let settings = Settings::get(&ctx)?;
    if !settings.sso.enabled {
        return failure(&settings, code::DISABLED, &[]);
    }
    let ip = meta.ip.clone().unwrap_or_else(|| "unknown".to_string());
    if !rate_limit::allow(&format!("sso:login:{ip}"), settings.login.ip_attempts_per_minute, Duration::from_secs(60)) {
        return failure(&settings, code::RATE, &[]);
    }

    let state = format!("{}.{}", hash::random_string(40), Utc::now().timestamp());
    let mut target = Url::parse(&settings.sso.portal_base_url)
        .and_then(|base| base.join("/sso/authorize"))
        .map_err(|_| Error::InternalServerError)?;
    target
        .query_pairs_mut()
        .append_pair("client_id", &settings.sso.client_id)
        .append_pair("redirect_uri", &settings.sso.redirect_uri)
        .append_pair("state", &state);
    redirect(target.as_str(), &[state_cookie(&settings, &state, settings.sso.state_ttl_seconds)])
}

/// Memeriksa `state` terhadap cookie: sama persis (waktu-konstan) dan belum kedaluwarsa.
fn state_is_valid(supplied: Option<&str>, cookie: Option<&str>, ttl_seconds: i64, now: i64) -> bool {
    let (Some(supplied), Some(cookie)) = (supplied, cookie) else {
        return false;
    };
    if supplied.len() != cookie.len() || !bool::from(supplied.as_bytes().ct_eq(cookie.as_bytes())) {
        return false;
    }
    let issued = supplied.rsplit_once('.').and_then(|(_, ts)| ts.parse::<i64>().ok());
    issued.is_some_and(|ts| ts <= now && now - ts <= ttl_seconds)
}

fn valid_code(code: &str) -> bool {
    !code.is_empty() && code.len() <= 256 && code.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~'))
}

/// Urutan prioritas bila satu orang membawa beberapa peran Portal (hak terbesar dulu).
const ROLE_PRECEDENCE: [Role; 5] =
    [Role::AdminPt, Role::AdminKemahasiswaan, Role::AdminProdi, Role::DosenPembina, Role::Auditor];

/// Peran lokal untuk pengguna baru. `None` bila Portal tidak memberi dasar yang cukup.
fn role_for_new_user(sso: &SsoSettings, identity: &Identity) -> Option<Role> {
    match identity.kind.as_str() {
        "student" => Role::parse(&sso.default_student_role),
        "staff" => {
            let mapped: Vec<Role> = identity
                .roles
                .iter()
                .filter_map(|r| sso.role_map.get(r))
                .filter_map(|r| Role::parse(r))
                .collect();
            ROLE_PRECEDENCE.into_iter().find(|r| mapped.contains(r))
        }
        _ => None,
    }
}

enum Resolved {
    User(Box<users::Model>),
    Denied(&'static str, &'static str),
}

/// NIM yang sah: 3-30 karakter huruf/angka/. - /
fn clean_nim(value: &str) -> Option<String> {
    let v = value.trim();
    ((3..=30).contains(&v.len()) && v.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'/'))).then(|| v.to_string())
}

/// NIM mahasiswa dari Portal; bila Portal tidak mengirimnya, dari data master berdasarkan email.
async fn portal_nim(ctx: &AppContext, tenant_id: i64, identity: &Identity) -> Result<Option<String>> {
    if identity.kind != "student" {
        return Ok(None);
    }
    if let Some(nim) = identity.nim.as_deref().and_then(clean_nim) {
        return Ok(Some(nim));
    }
    Ok(master_data::active_student_by_email(&ctx.db, tenant_id, &identity.email).await?.and_then(|s| clean_nim(&s.nim)))
}

/// Mencocokkan identitas Portal ke akun lokal, atau membuatnya bila syarat terpenuhi.
async fn resolve_user(ctx: &AppContext, settings: &Settings, tenant: &tenants::Model, identity: &Identity, nim: Option<String>) -> Result<Resolved> {
    let email = identity.email.trim().to_lowercase();
    if email.len() > 254 || !email.validate_email() {
        return Ok(Resolved::Denied(code::INVALID, "email_invalid"));
    }

    if let Ok(user) = users::Model::find_by_portal_id(&ctx.db, identity.id).await {
        return Ok(Resolved::User(Box::new(user)));
    }

    if let Ok(user) = users::Model::find_by_email(&ctx.db, &email).await {
        // Akun lokal sudah ada (dibuat admin): ikat satu kali ke identitas Portal ini.
        if user.tenant_id != tenant.id {
            return Ok(Resolved::Denied(code::UNREGISTERED, "other_tenant"));
        }
        if user.portal_user_id.is_some() {
            return Ok(Resolved::Denied(code::UNREGISTERED, "email_bound_to_other_identity"));
        }
        let linked = user.into_active_model().link_portal(&ctx.db, identity.id).await.map_err(Error::Model)?;
        return Ok(Resolved::User(Box::new(linked)));
    }

    let Some(role) = role_for_new_user(&settings.sso, identity) else {
        return Ok(Resolved::Denied(code::UNREGISTERED, "no_local_role"));
    };

    // Bila cache master aktif, pemilik email harus terdaftar sebagai mahasiswa/pegawai aktif.
    if settings.master_sync.enabled {
        let known = if identity.kind == "student" {
            master_data::active_student_by_email(&ctx.db, tenant.id, &email)
                .await?
                .is_some_and(|s| identity.nim.as_deref().is_none_or(|nim| nim == s.nim))
        } else {
            master_data::active_employee_by_email(&ctx.db, tenant.id, &email)
                .await?
                .is_some_and(|e| identity.nip.as_deref().is_none_or(|nip| nip == e.nip))
        };
        if !known {
            return Ok(Resolved::Denied(code::UNREGISTERED, "not_in_master_data"));
        }
    }

    let name: String = identity.name.trim().chars().filter(|c| !c.is_control()).take(120).collect();
    let name = if name.chars().count() < 2 { email.split('@').next().unwrap_or("Pengguna").to_string() } else { name };
    let created = users::Model::create_sso(
        &ctx.db,
        &NewSsoUser { tenant_id: tenant.id, portal_user_id: identity.id, email, name, role: role.as_str().to_string(), nim },
    )
    .await;
    match created {
        Ok(user) => Ok(Resolved::User(Box::new(user))),
        // Dua callback bersamaan untuk orang yang sama: pemenangnya sudah membuat akun.
        Err(ModelError::EntityAlreadyExists) => users::Model::find_by_portal_id(&ctx.db, identity.id)
            .await
            .map(|u| Resolved::User(Box::new(u)))
            .map_err(Error::Model),
        Err(e) => Err(Error::Model(e)),
    }
}

/// `GET /api/sso/callback`: tukar kode, cocokkan akun, terbitkan sesi, alihkan ke aplikasi.
#[debug_handler]
async fn callback(State(ctx): State<AppContext>, meta: ClientMeta, headers: axum::http::HeaderMap, Query(q): Query<CallbackQuery>) -> Result<Response> {
    let settings = Settings::get(&ctx)?;
    let clear_state = state_cookie(&settings, "", 0);
    if !settings.sso.enabled {
        return failure(&settings, code::DISABLED, &[clear_state]);
    }
    let ip = meta.ip.clone().unwrap_or_else(|| "unknown".to_string());
    if !rate_limit::allow(&format!("sso:callback:{ip}"), settings.login.ip_attempts_per_minute, Duration::from_secs(60)) {
        return failure(&settings, code::RATE, &[clear_state]);
    }

    let cookie_state = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|raw| read_cookie(raw, &state_cookie_name(&settings)));
    if !state_is_valid(q.state.as_deref(), cookie_state.as_deref(), settings.sso.state_ttl_seconds, Utc::now().timestamp()) {
        audit_anonymous(&ctx, &meta, None, Outcome::Denied, json!({"reason": "bad_state"})).await?;
        return failure(&settings, code::STATE, &[clear_state]);
    }
    if q.error.is_some() {
        audit_anonymous(&ctx, &meta, None, Outcome::Denied, json!({"reason": "portal_error"})).await?;
        return failure(&settings, code::INVALID, &[clear_state]);
    }
    let Some(auth_code) = q.code.as_deref().filter(|c| valid_code(c)) else {
        audit_anonymous(&ctx, &meta, None, Outcome::Denied, json!({"reason": "bad_code_format"})).await?;
        return failure(&settings, code::INVALID, &[clear_state]);
    };

    let tenant = tenants::Entity::find()
        .filter(tenants::Column::Slug.eq(settings.sso.tenant_slug.as_str()))
        .one(&ctx.db)
        .await?
        .ok_or_else(|| Error::string("sso.tenant_slug tidak ditemukan"))?;

    let client = Client::new(&settings.sso).map_err(|m| Error::string(&format!("klien Portal: {m}")))?;
    let identity = match client.verify(auth_code).await {
        Ok(identity) => identity,
        Err(err) => {
            let (shown, reason) = match &err {
                PortalError::InvalidCode => (code::INVALID, "invalid_code"),
                PortalError::Auth => (code::UNAVAILABLE, "portal_auth_failed"),
                PortalError::Rejected(_) => (code::UNAVAILABLE, "portal_rejected"),
                PortalError::Transient(_) => (code::UNAVAILABLE, "portal_unavailable"),
            };
            // `describe` tidak memuat isi respons Portal.
            tracing::warn!(reason, detail = %err.describe(), "verifikasi kode SSO gagal");
            audit_anonymous(&ctx, &meta, Some(tenant.id), Outcome::Failure, json!({"reason": reason})).await?;
            return failure(&settings, shown, &[clear_state]);
        }
    };

    let nim = portal_nim(&ctx, tenant.id, &identity).await?;
    let user = match resolve_user(&ctx, &settings, &tenant, &identity, nim.clone()).await? {
        Resolved::User(user) => *user,
        Resolved::Denied(shown, reason) => {
            audit_anonymous(&ctx, &meta, Some(tenant.id), Outcome::Denied, json!({"reason": reason, "portal_user": identity.id})).await?;
            return failure(&settings, shown, &[clear_state]);
        }
    };
    if !user.is_active || user.role_enum().is_none() {
        audit_anonymous(&ctx, &meta, Some(tenant.id), Outcome::Denied, json!({"reason": "local_inactive", "user": user.pid})).await?;
        return failure(&settings, code::INACTIVE, &[clear_state]);
    }

    // Simpan/segarkan NIM dari Portal agar formulir mahasiswa terisi otomatis.
    let user = match nim.as_deref() {
        Some(n) if user.nim.as_deref() != Some(n) => user.into_active_model().set_nim(&ctx.db, n).await.map_err(Error::Model)?,
        _ => user,
    };
    let user = user.into_active_model().login_succeeded(&ctx.db).await.map_err(Error::Model)?;
    let issued = sessions::Model::issue(
        &ctx.db,
        user.id,
        meta.ip.as_deref(),
        meta.user_agent.as_deref(),
        settings.session.absolute_hours,
        settings.session.max_sessions_per_user,
    )
    .await
    .map_err(Error::Model)?;
    audit_logs::Model::record(
        &ctx.db,
        Entry {
            tenant_id: Some(user.tenant_id),
            actor: Some(audit_logs::Actor { id: user.id, email: user.email.clone(), role: user.role.clone() }),
            action: "auth.sso_login",
            entity: "session",
            entity_ref: Some(user.pid.to_string()),
            outcome: Outcome::Success,
            ip: meta.ip.clone(),
            request_id: meta.request_id.clone(),
            detail: json!({"portal_user": identity.id, "portal_type": identity.kind}),
        },
    )
    .await
    .map_err(Error::Model)?;

    redirect(
        &settings.sso.post_login_url,
        &[clear_state, session_cookie(&settings, &issued.token, settings.session.absolute_hours * 3600)],
    )
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/sso")
        .add("/config", get(config))
        .add("/login", get(login))
        .add("/callback", get(callback))
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;

    fn identity(kind: &str, roles: &[&str]) -> Identity {
        Identity {
            id: uuid::Uuid::nil(),
            email: "a@kampus.ac.id".into(),
            name: "A".into(),
            kind: kind.into(),
            nim: None,
            nip: None,
            roles: roles.iter().map(ToString::to_string).collect(),
        }
    }

    #[test]
    fn state_requires_match_and_freshness() {
        let s = "abc.1000";
        assert!(state_is_valid(Some(s), Some(s), 600, 1100));
        assert!(!state_is_valid(Some(s), Some(s), 600, 1700), "kedaluwarsa");
        assert!(!state_is_valid(Some(s), Some("abd.1000"), 600, 1100), "beda");
        assert!(!state_is_valid(Some(s), None, 600, 1100), "cookie hilang");
        assert!(!state_is_valid(None, Some(s), 600, 1100), "state hilang");
        assert!(!state_is_valid(Some("abc.9999"), Some("abc.9999"), 600, 1100), "waktu di masa depan");
        assert!(!state_is_valid(Some("abc"), Some("abc"), 600, 1100), "tanpa cap waktu");
    }

    #[test]
    fn code_format() {
        assert!(valid_code("AbC123-_.~"));
        assert!(!valid_code(""));
        assert!(!valid_code("a b"));
        assert!(!valid_code("a/../b"));
        assert!(!valid_code(&"a".repeat(257)));
    }

    #[test]
    fn student_gets_default_role_staff_needs_mapping() {
        let mut sso = SsoSettings::default();
        assert_eq!(role_for_new_user(&sso, &identity("student", &[])), Some(Role::Mahasiswa));
        assert_eq!(role_for_new_user(&sso, &identity("staff", &["dosen"])), None);
        sso.role_map = BTreeMap::from([
            ("dosen".to_string(), "DOSEN_PEMBINA".to_string()),
            ("kemahasiswaan".to_string(), "ADMIN_KEMAHASISWAAN".to_string()),
        ]);
        assert_eq!(role_for_new_user(&sso, &identity("staff", &["dosen"])), Some(Role::DosenPembina));
        assert_eq!(
            role_for_new_user(&sso, &identity("staff", &["dosen", "kemahasiswaan"])),
            Some(Role::AdminKemahasiswaan),
            "hak terbesar menang"
        );
        assert_eq!(role_for_new_user(&sso, &identity("alien", &["dosen"])), None);
    }

    #[test]
    fn cookie_parsing() {
        assert_eq!(read_cookie("a=1; sc_sso=xyz; b=2", "sc_sso").as_deref(), Some("xyz"));
        assert_eq!(read_cookie("a=1", "sc_sso"), None);
    }
}
