//! Koneksi akun SIMKATMAWA. Password/token dienkripsi di backend dan tidak pernah dikembalikan.

use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use loco_rs::prelude::*;
use serde::Deserialize;
use serde_json::json;
use validator::ValidateEmail;

use super::support::{audit, map_model};
use crate::{
    errors::{bad_gateway, too_many_requests, FieldErrors},
    integrations::simkatmawa::{CallError, Client, LoginOk, ASSUMED_TOKEN_TTL_MINUTES},
    models::{audit_logs::Outcome, simkatmawa_credentials},
    security::{principal::Principal, rate_limit, roles::Perm, url_guard},
    settings::{self, Settings},
    views::CredentialStatusView,
};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CredentialParams {
    #[serde(default)]
    api_url: Option<String>,
    email: String,
    password: String,
}

struct Checked {
    api_url: String,
    email: String,
    login: LoginOk,
}

/// Validasi masukan (anti-SSRF) lalu uji login ke SIMKATMAWA.
async fn verify(ctx: &AppContext, p: &Principal, params: &CredentialParams) -> Result<Checked> {
    let settings = Settings::get(ctx)?;
    if !rate_limit::allow(&format!("cred:{}", p.user.id), 10, Duration::from_secs(600)) {
        return too_many_requests("Terlalu banyak percobaan koneksi. Tunggu beberapa menit.");
    }
    let mut errors = FieldErrors::default();
    let email = params.email.trim().to_string();
    if !email.validate_email() || email.len() > 254 {
        errors.add("email", "Email tidak valid.");
    }
    if params.password.is_empty() || params.password.len() > 256 {
        errors.add("password", "Password wajib diisi.");
    }
    let api_url = params.api_url.clone().filter(|u| !u.trim().is_empty()).unwrap_or_else(|| settings.simkatmawa.default_api_url.clone());
    let base = match url_guard::outbound_api(&api_url, &settings.simkatmawa.allowed_hosts) {
        Ok(u) => Some(u),
        Err(msg) => {
            errors.add("api_url", msg);
            None
        }
    };
    errors.into_result()?;
    let base = base.ok_or(Error::InternalServerError)?;
    let client = Client::new(base.clone(), Duration::from_secs(settings.simkatmawa.timeout_seconds)).map_err(Error::Message)?;
    match client.login(&email, &params.password).await {
        Ok(login) => Ok(Checked { api_url: base.origin().ascii_serialization(), email, login }),
        Err(CallError::Auth) => {
            audit(ctx, p, "simkatmawa.login", "credential", None, Outcome::Failure, json!({"reason": "rejected"})).await?;
            Err(Error::BadRequest("Email atau password SIMKATMAWA ditolak.".into()))
        }
        Err(_) => bad_gateway("SIMKATMAWA tidak dapat dihubungi saat ini. Coba lagi nanti."),
    }
}

#[debug_handler]
async fn status(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    p.require(Perm::RecordRead)?;
    let cred = simkatmawa_credentials::Model::find_for_tenant(&ctx.db, p.tenant_id()).await.map_err(map_model)?;
    format::json(CredentialStatusView::from_model(cred.as_ref()))
}

#[debug_handler]
async fn test(State(ctx): State<AppContext>, p: Principal, Json(params): Json<CredentialParams>) -> Result<Response> {
    p.require(Perm::CredentialManage)?;
    let checked = verify(&ctx, &p, &params).await?;
    audit(&ctx, &p, "simkatmawa.test", "credential", None, Outcome::Success, json!({"kode_pt": checked.login.kode_pt})).await?;
    format::json(json!({"ok": true, "kode_pt": checked.login.kode_pt}))
}

#[debug_handler]
async fn save(State(ctx): State<AppContext>, p: Principal, Json(params): Json<CredentialParams>) -> Result<Response> {
    p.require(Perm::CredentialManage)?;
    let checked = verify(&ctx, &p, &params).await?;
    let vault = settings::vault(&ctx)?;
    let saved = simkatmawa_credentials::Model::save(&ctx.db, &vault, p.tenant_id(), &checked.api_url, &checked.email, &params.password)
        .await
        .map_err(map_model)?;
    let saved = saved
        .into_active_model()
        .store_token(&ctx.db, &vault, p.tenant_id(), &checked.login.token, Utc::now() + ChronoDuration::minutes(ASSUMED_TOKEN_TTL_MINUTES))
        .await
        .map_err(map_model)?;
    audit(&ctx, &p, "simkatmawa.credentials.save", "credential", None, Outcome::Success, json!({"email": saved.email})).await?;
    format::json(CredentialStatusView::from_model(Some(&saved)))
}

#[debug_handler]
async fn refresh(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    p.require(Perm::CredentialManage)?;
    let settings = Settings::get(&ctx)?;
    let vault = settings::vault(&ctx)?;
    let Some(cred) = simkatmawa_credentials::Model::find_for_tenant(&ctx.db, p.tenant_id()).await.map_err(map_model)? else {
        return Err(Error::BadRequest("Kredensial SIMKATMAWA belum diatur.".into()));
    };
    let base = url_guard::outbound_api(&cred.api_url, &settings.simkatmawa.allowed_hosts).map_err(|m| Error::BadRequest(m.into()))?;
    let client = Client::new(base, Duration::from_secs(settings.simkatmawa.timeout_seconds)).map_err(Error::Message)?;
    let password = cred.password(&vault).map_err(|e| Error::Message(e.to_string()))?;
    let result = client.login(&cred.email, &password).await;
    let active = cred.into_active_model();
    let saved = match result {
        Ok(login) => active
            .store_token(&ctx.db, &vault, p.tenant_id(), &login.token, Utc::now() + ChronoDuration::minutes(ASSUMED_TOKEN_TTL_MINUTES))
            .await
            .map_err(map_model)?,
        Err(e) => {
            let msg = e.describe();
            active.record_failure(&ctx.db, &msg).await.map_err(map_model)?;
            audit(&ctx, &p, "simkatmawa.refresh", "credential", None, Outcome::Failure, json!({"reason": msg})).await?;
            return bad_gateway("Gagal memperbarui token SIMKATMAWA.");
        }
    };
    audit(&ctx, &p, "simkatmawa.refresh", "credential", None, Outcome::Success, json!({})).await?;
    format::json(CredentialStatusView::from_model(Some(&saved)))
}

#[debug_handler]
async fn disconnect(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    p.require(Perm::CredentialManage)?;
    simkatmawa_credentials::Entity::delete_many()
        .filter(simkatmawa_credentials::Column::TenantId.eq(p.tenant_id()))
        .exec(&ctx.db)
        .await?;
    audit(&ctx, &p, "simkatmawa.credentials.delete", "credential", None, Outcome::Success, json!({})).await?;
    format::json(CredentialStatusView::from_model(None))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/simkatmawa")
        .add("/status", get(status))
        .add("/credentials/test", post(test))
        .add("/credentials", put(save))
        .add("/credentials", delete(disconnect))
        .add("/refresh-token", post(refresh))
}
