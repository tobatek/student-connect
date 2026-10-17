//! Manajemen pengguna oleh admin. Tidak ada pendaftaran mandiri (A.5.16, A.5.18).

use loco_rs::prelude::*;
use serde::Deserialize;
use serde_json::json;

use super::support::{audit, created, map_model};
use crate::{
    errors::{forbidden, FieldErrors},
    models::{
        audit_logs::Outcome,
        sessions,
        users::{self, NewUser},
    },
    security::{
        password,
        principal::Principal,
        roles::{Perm, Role},
    },
    views::UserView,
};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateUser {
    email: String,
    name: String,
    role: String,
    password: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateUser {
    name: Option<String>,
    role: Option<String>,
    is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ResetPassword {
    password: String,
}

/// Hanya SUPER_ADMIN yang boleh menyentuh akun SUPER_ADMIN (cegah eskalasi hak).
fn guard_privileged(p: &Principal, target_role: &str) -> Result<()> {
    if target_role == Role::SuperAdmin.as_str() && p.role != Role::SuperAdmin {
        return forbidden("Hanya SUPER_ADMIN yang dapat mengelola akun SUPER_ADMIN.");
    }
    Ok(())
}

#[debug_handler]
async fn list(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    p.require(Perm::UserManage)?;
    let items = users::Model::list_in_tenant(&ctx.db, p.tenant_id()).await.map_err(map_model)?;
    format::json(items.iter().map(UserView::from).collect::<Vec<_>>())
}

#[debug_handler]
async fn create(State(ctx): State<AppContext>, p: Principal, Json(params): Json<CreateUser>) -> Result<Response> {
    p.require(Perm::UserManage)?;
    guard_privileged(&p, &params.role)?;
    let mut new = NewUser {
        tenant_id: p.tenant_id(),
        email: params.email,
        name: params.name,
        role: params.role,
        password: params.password,
    };
    if let Err(errors) = new.validate() {
        errors.into_result()?;
    }
    let user = users::Model::create(&ctx.db, &new).await.map_err(map_model)?;
    audit(&ctx, &p, "user.create", "user", Some(user.pid.to_string()), Outcome::Success, json!({"role": user.role})).await?;
    created(&UserView::from(&user))
}

#[debug_handler]
async fn update(State(ctx): State<AppContext>, p: Principal, Path(id): Path<Uuid>, Json(params): Json<UpdateUser>) -> Result<Response> {
    p.require(Perm::UserManage)?;
    let target = users::Model::find_in_tenant(&ctx.db, p.tenant_id(), id).await.map_err(map_model)?;
    guard_privileged(&p, &target.role)?;
    let mut errors = FieldErrors::default();
    let mut access_changed = false;
    let mut am = target.clone().into_active_model();

    if let Some(name) = params.name {
        let name = name.trim().to_string();
        if name.chars().count() < 2 || name.chars().count() > 120 {
            errors.add("name", "Nama 2-120 karakter.");
        }
        am.name = ActiveValue::set(name);
    }
    if let Some(role) = params.role {
        if Role::parse(&role).is_none() {
            errors.add("role", "Peran tidak dikenal.");
        }
        guard_privileged(&p, &role)?;
        if target.id == p.user.id && role != target.role {
            return forbidden("Anda tidak dapat mengubah peran akun sendiri.");
        }
        access_changed |= role != target.role;
        am.role = ActiveValue::set(role);
    }
    if let Some(active) = params.is_active {
        if target.id == p.user.id && !active {
            return forbidden("Anda tidak dapat menonaktifkan akun sendiri.");
        }
        access_changed |= active != target.is_active;
        am.is_active = ActiveValue::set(active);
    }
    errors.into_result()?;

    let saved = am.update(&ctx.db).await?;
    if access_changed {
        sessions::Model::revoke_all(&ctx.db, saved.id).await.map_err(map_model)?;
    }
    audit(&ctx, &p, "user.update", "user", Some(saved.pid.to_string()), Outcome::Success, json!({"role": saved.role, "is_active": saved.is_active})).await?;
    format::json(UserView::from(&saved))
}

#[debug_handler]
async fn reset_password(State(ctx): State<AppContext>, p: Principal, Path(id): Path<Uuid>, Json(params): Json<ResetPassword>) -> Result<Response> {
    p.require(Perm::UserManage)?;
    let target = users::Model::find_in_tenant(&ctx.db, p.tenant_id(), id).await.map_err(map_model)?;
    guard_privileged(&p, &target.role)?;
    if let Err(msg) = password::validate(&params.password, &target.email) {
        let mut e = FieldErrors::default();
        e.add("password", msg);
        e.into_result()?;
    }
    let saved = target.into_active_model().set_password(&ctx.db, &params.password, true).await.map_err(map_model)?;
    sessions::Model::revoke_all(&ctx.db, saved.id).await.map_err(map_model)?;
    audit(&ctx, &p, "user.reset_password", "user", Some(saved.pid.to_string()), Outcome::Success, json!({})).await?;
    format::empty_json()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/users")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", patch(update))
        .add("/{id}/reset-password", post(reset_password))
}
