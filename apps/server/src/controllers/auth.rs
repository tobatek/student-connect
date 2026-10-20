//! Login, logout, profil sesi, dan ganti kata sandi.
//!
//! Kontrol: pembatasan laju per IP & per email, penguncian akun, pesan galat seragam,
//! pengaturan waktu sama untuk email tak dikenal (anti enumerasi), sesi baru tiap login
//! (anti session fixation), seluruh sesi dicabut saat kata sandi berubah. ISO 27001:2022 A.5.17, A.8.5.

use std::time::Duration;

use loco_rs::prelude::*;
use serde::Deserialize;
use serde_json::json;

use crate::{
    errors::{too_many_requests, FieldErrors},
    models::{
        audit_logs::{self, Entry, Outcome},
        sessions, tenants, users,
    },
    security::{
        password, rate_limit,
        principal::{ClientMeta, Principal},
    },
    settings::Settings,
    views::MeView,
};

use super::support::{audit, map_model, student_identity};

const GENERIC_FAILURE: &str = "Email atau kata sandi salah, atau akun terkunci sementara.";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LoginParams {
    email: String,
    password: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ChangePasswordParams {
    current_password: String,
    new_password: String,
}

fn session_cookie(settings: &Settings, value: &str, max_age_seconds: i64) -> String {
    let secure = if settings.session.cookie_secure { "; Secure" } else { "" };
    format!(
        "{}={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={max_age_seconds}{secure}",
        settings.session.cookie_name
    )
}

async fn anonymous_audit(ctx: &AppContext, meta: &ClientMeta, outcome: Outcome, detail: serde_json::Value) -> Result<()> {
    audit_logs::Model::record(
        &ctx.db,
        Entry {
            tenant_id: None,
            actor: None,
            action: "auth.login",
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

#[debug_handler]
async fn login(State(ctx): State<AppContext>, meta: ClientMeta, Json(params): Json<LoginParams>) -> Result<Response> {
    let settings = Settings::get(&ctx)?;
    // Setelah SSO stabil, form sandi lokal dimatikan (aplikasi non-Portal tidak punya login sendiri).
    if settings.sso.enabled && !settings.sso.password_login_enabled {
        anonymous_audit(&ctx, &meta, Outcome::Denied, json!({"reason": "password_login_disabled"})).await?;
        return crate::errors::forbidden("Masuk dengan sandi dinonaktifkan. Gunakan Login dengan Portal.");
    }
    let ip = meta.ip.clone().unwrap_or_else(|| "unknown".to_string());
    let email = params.email.trim().to_lowercase();

    if !rate_limit::allow(&format!("login:ip:{ip}"), settings.login.ip_attempts_per_minute, Duration::from_secs(60))
        || !rate_limit::allow(&format!("login:email:{email}"), 10, Duration::from_secs(60))
    {
        return too_many_requests("Terlalu banyak percobaan. Coba lagi sebentar lagi.");
    }
    if email.len() > 254 || params.password.is_empty() || params.password.len() > 128 {
        return unauthorized(GENERIC_FAILURE);
    }

    let attempted: String = email.chars().take(120).collect();
    let found = users::Model::find_by_email(&ctx.db, &email).await;
    if let Err(err) = &found {
        if !matches!(err, ModelError::EntityNotFound) {
            tracing::error!(error = %err, "pencarian akun saat login gagal");
        }
    }
    let Ok(user) = found else {
        users::Model::burn_password_check(&params.password);
        anonymous_audit(&ctx, &meta, Outcome::Failure, json!({"reason": "unknown_email", "email": attempted})).await?;
        return unauthorized(GENERIC_FAILURE);
    };

    if !user.is_active || user.is_locked() {
        users::Model::burn_password_check(&params.password);
        anonymous_audit(&ctx, &meta, Outcome::Denied, json!({"reason": "inactive_or_locked", "email": attempted})).await?;
        return unauthorized(GENERIC_FAILURE);
    }

    if !user.verify_password(&params.password) {
        let attempts = user.failed_login_attempts;
        let updated = user
            .clone()
            .into_active_model()
            .failed_login(&ctx.db, attempts, settings.login.max_failed_attempts, settings.login.lockout_minutes)
            .await
            .map_err(Error::Model)?;
        let locked_now = updated.is_locked();
        audit_logs::Model::record(
            &ctx.db,
            Entry {
                tenant_id: Some(user.tenant_id),
                actor: None,
                action: "auth.login",
                entity: "user",
                entity_ref: Some(user.pid.to_string()),
                outcome: Outcome::Failure,
                ip: meta.ip.clone(),
                request_id: meta.request_id.clone(),
                detail: json!({"reason": "bad_password", "locked_now": locked_now}),
            },
        )
        .await
        .map_err(Error::Model)?;
        return unauthorized(GENERIC_FAILURE);
    }

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
            action: "auth.login",
            entity: "session",
            entity_ref: Some(user.pid.to_string()),
            outcome: Outcome::Success,
            ip: meta.ip.clone(),
            request_id: meta.request_id.clone(),
            detail: json!({}),
        },
    )
    .await
    .map_err(Error::Model)?;

    let tenant = tenants::Model::find_by_id(&ctx.db, user.tenant_id).await.map_err(Error::Model)?;
    let role = user.role_enum().ok_or(Error::InternalServerError)?;
    let me = MeView::new(&user, &tenant, role, issued.session.csrf_token.clone()).with_student(student_identity(&ctx, &user).await?);
    let cookie = session_cookie(&settings, &issued.token, settings.session.absolute_hours * 3600);
    format::render().header("set-cookie", &cookie).header("cache-control", "no-store").json(me)
}

#[debug_handler]
async fn logout(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    let settings = Settings::get(&ctx)?;
    p.session.clone().into_active_model().revoke(&ctx.db).await.map_err(Error::Model)?;
    audit(&ctx, &p, "auth.logout", "session", Some(p.user.pid.to_string()), Outcome::Success, json!({})).await?;
    format::render().header("set-cookie", &session_cookie(&settings, "", 0)).header("cache-control", "no-store").empty()
}

#[debug_handler]
async fn me(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    let tenant = tenants::Model::find_by_id(&ctx.db, p.tenant_id()).await.map_err(Error::Model)?;
    let view = MeView::new(&p.user, &tenant, p.role, p.session.csrf_token.clone()).with_student(student_identity(&ctx, &p.user).await?);
    format::render().header("cache-control", "no-store").json(view)
}

#[debug_handler]
async fn change_password(State(ctx): State<AppContext>, p: Principal, Json(params): Json<ChangePasswordParams>) -> Result<Response> {
    let settings = Settings::get(&ctx)?;
    if !rate_limit::allow(&format!("pwchange:{}", p.user.id), 5, Duration::from_secs(600)) {
        return too_many_requests("Terlalu banyak percobaan ganti kata sandi.");
    }
    let mut errors = FieldErrors::default();
    if params.current_password.len() > 128 || !p.user.verify_password(&params.current_password) {
        audit(&ctx, &p, "auth.change_password", "user", Some(p.user.pid.to_string()), Outcome::Failure, json!({"reason": "bad_current_password"})).await?;
        errors.add("current_password", "Kata sandi saat ini salah.");
    }
    if let Err(msg) = password::validate(&params.new_password, &p.user.email) {
        errors.add("new_password", msg);
    }
    if params.new_password == params.current_password {
        errors.add("new_password", "Kata sandi baru harus berbeda.");
    }
    errors.into_result()?;

    let user = p
        .user
        .clone()
        .into_active_model()
        .set_password(&ctx.db, &params.new_password, false)
        .await
        .map_err(map_model)?;
    // Cabut semua sesi lama (termasuk yang sedang dipakai) lalu terbitkan sesi baru.
    sessions::Model::revoke_all(&ctx.db, user.id).await.map_err(Error::Model)?;
    let issued = sessions::Model::issue(
        &ctx.db,
        user.id,
        p.meta.ip.as_deref(),
        p.meta.user_agent.as_deref(),
        settings.session.absolute_hours,
        settings.session.max_sessions_per_user,
    )
    .await
    .map_err(Error::Model)?;
    audit(&ctx, &p, "auth.change_password", "user", Some(user.pid.to_string()), Outcome::Success, json!({})).await?;

    let tenant = tenants::Model::find_by_id(&ctx.db, user.tenant_id).await.map_err(Error::Model)?;
    let me = MeView::new(&user, &tenant, p.role, issued.session.csrf_token.clone()).with_student(student_identity(&ctx, &user).await?);
    let cookie = session_cookie(&settings, &issued.token, settings.session.absolute_hours * 3600);
    format::render().header("set-cookie", &cookie).header("cache-control", "no-store").json(me)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/auth")
        .add("/login", post(login))
        .add("/logout", post(logout))
        .add("/me", get(me))
        .add("/change-password", post(change_password))
}
