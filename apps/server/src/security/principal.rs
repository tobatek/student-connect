//! Autentikasi permintaan: cookie sesi HttpOnly + token CSRF sinkron untuk metode yang mengubah state.
//!
//! * Token sesi acak 48 karakter, hanya hash-nya di database (A.5.17).
//! * Kedaluwarsa idle + absolut, pencabutan sesi sisi-server (A.8.5).
//! * `Principal` sebagai extractor membuat handler tanpa autentikasi tidak mungkin dikompilasi
//!   untuk endpoint terlindungi (default-deny, A.5.15).

use std::convert::Infallible;

use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts, Method},
};
use chrono::Utc;
use loco_rs::{
    app::AppContext,
    controller::middleware::{remote_ip::RemoteIP, request_id::LocoRequestId},
    prelude::*,
};
use subtle::ConstantTimeEq;

use super::roles::{Perm, Role};
use crate::{
    errors::forbidden,
    models::{sessions, users},
    settings::Settings,
};

/// Metadata klien untuk audit dan pembatasan laju.
#[derive(Debug, Clone, Default)]
pub struct ClientMeta {
    pub ip: Option<String>,
    pub request_id: Option<String>,
    pub user_agent: Option<String>,
}

impl<S: Send + Sync> FromRequestParts<S> for ClientMeta {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> std::result::Result<Self, Self::Rejection> {
        let ip = match RemoteIP::from_request_parts(parts, state)
            .await
            .unwrap_or(RemoteIP::None)
        {
            RemoteIP::Forwarded(ip) | RemoteIP::Socket(ip) => Some(ip.to_string()),
            RemoteIP::None => None,
        };
        let request_id = parts
            .extensions
            .get::<LocoRequestId>()
            .map(|id| id.get().to_string());
        let user_agent = parts
            .headers
            .get(header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        Ok(Self { ip, request_id, user_agent })
    }
}

/// Pengguna terautentikasi beserta sesinya.
#[derive(Debug, Clone)]
pub struct Principal {
    pub user: users::Model,
    pub session: sessions::Model,
    pub role: Role,
    pub meta: ClientMeta,
}

impl Principal {
    #[must_use]
    pub const fn tenant_id(&self) -> i64 {
        self.user.tenant_id
    }

    #[must_use]
    pub fn can(&self, perm: Perm) -> bool {
        self.role.can(perm)
    }

    /// # Errors
    /// 403 bila peran tidak memiliki izin.
    pub fn require(&self, perm: Perm) -> Result<()> {
        if self.can(perm) {
            Ok(())
        } else {
            forbidden("Anda tidak memiliki izin untuk aksi ini.")
        }
    }

    #[must_use]
    pub fn actor(&self) -> crate::models::audit_logs::Actor {
        crate::models::audit_logs::Actor {
            id: self.user.id,
            email: self.user.email.clone(),
            role: self.user.role.clone(),
        }
    }
}

fn read_cookie<'a>(header_value: &'a str, name: &str) -> Option<&'a str> {
    header_value.split(';').find_map(|pair| {
        let (k, v) = pair.trim().split_once('=')?;
        (k == name).then_some(v)
    })
}

fn is_mutating(method: &Method) -> bool {
    !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

fn unauthenticated() -> Error {
    Error::Unauthorized("Sesi tidak valid atau telah berakhir.".to_string())
}

impl FromRequestParts<AppContext> for Principal {
    type Rejection = Error;

    async fn from_request_parts(parts: &mut Parts, ctx: &AppContext) -> Result<Self> {
        let settings = Settings::get(ctx)?;
        let meta = ClientMeta::from_request_parts(parts, ctx)
            .await
            .unwrap_or_default();

        let token = parts
            .headers
            .get(header::COOKIE)
            .and_then(|v| v.to_str().ok())
            .and_then(|raw| read_cookie(raw, &settings.session.cookie_name))
            .filter(|t| t.len() == 48 && t.bytes().all(|b| b.is_ascii_alphanumeric()))
            .ok_or_else(unauthenticated)?;

        let session = sessions::Model::find_active(&ctx.db, token, settings.session.idle_minutes)
            .await
            .map_err(|_| unauthenticated())?;

        // CSRF (synchronizer token): metode yang mengubah state wajib membawa token sesi.
        if is_mutating(&parts.method) {
            let supplied = parts
                .headers
                .get("x-csrf-token")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            let matches: bool = supplied
                .as_bytes()
                .ct_eq(session.csrf_token.as_bytes())
                .into();
            if !matches {
                return forbidden("Token CSRF tidak valid.");
            }
        }

        let user = users::Model::find_by_id(&ctx.db, session.user_id)
            .await
            .map_err(|_| unauthenticated())?;
        if !user.is_active || user.is_locked() {
            return Err(unauthenticated());
        }
        let role = user.role_enum().ok_or_else(unauthenticated)?;

        // Akun dengan kata sandi sementara hanya boleh mengganti kata sandi / keluar.
        if user.must_change_password
            && !matches!(
                parts.uri.path(),
                "/api/auth/change-password" | "/api/auth/me" | "/api/auth/logout"
            )
        {
            return forbidden("Ganti kata sandi sementara Anda terlebih dahulu.");
        }

        // Perpanjang idle-timeout paling sering sekali per menit (kurangi tulis DB).
        if Utc::now().signed_duration_since(session.last_seen_at).num_seconds() > 60 {
            let _ = session.clone().into_active_model().touch(&ctx.db).await;
        }

        Ok(Self { user, session, role, meta })
    }
}
