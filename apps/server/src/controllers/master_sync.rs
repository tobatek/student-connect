//! Status dan pemicu manual sinkronisasi data master dari Portal.

use std::time::Duration;

use axum::http::StatusCode;
use loco_rs::prelude::*;
use serde::Deserialize;
use serde_json::json;

use super::support::{audit, map_model};
use crate::{
    errors::{conflict, too_many_requests, unprocessable},
    models::{
        audit_logs::Outcome,
        master_data::{master_employees, master_students},
        sync_runs,
    },
    security::{principal::Principal, rate_limit, roles::Perm},
    settings::Settings,
    views::SyncRunView,
    workers::master_sync::{MasterSyncWorker, MasterSyncWorkerArgs},
};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RunParams {
    /// `students`, `employees`, atau `all`.
    kind: String,
    /// `full` (default) atau `incremental`.
    mode: Option<String>,
}

#[debug_handler]
async fn show(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    p.require(Perm::SettingsManage)?;
    let settings = Settings::get(&ctx)?;
    let tenant = p.tenant_id();
    let runs = sync_runs::Model::recent(&ctx.db, tenant, 20).await.map_err(map_model)?;

    let students_active = master_students::Entity::find()
        .filter(master_students::Column::TenantId.eq(tenant))
        .filter(master_students::Column::IsActive.eq(true))
        .count(&ctx.db)
        .await?;
    let students_total = master_students::Entity::find().filter(master_students::Column::TenantId.eq(tenant)).count(&ctx.db).await?;
    let employees_active = master_employees::Entity::find()
        .filter(master_employees::Column::TenantId.eq(tenant))
        .filter(master_employees::Column::IsActive.eq(true))
        .count(&ctx.db)
        .await?;
    let employees_total = master_employees::Entity::find().filter(master_employees::Column::TenantId.eq(tenant)).count(&ctx.db).await?;

    format::render().header("cache-control", "no-store").json(json!({
        "enabled": settings.sso.enabled && settings.master_sync.enabled,
        "counts": {
            "students": {"active": students_active, "inactive": students_total - students_active},
            "employees": {"active": employees_active, "inactive": employees_total - employees_active},
        },
        "runs": runs.iter().map(SyncRunView::from).collect::<Vec<_>>(),
    }))
}

#[debug_handler]
async fn run(State(ctx): State<AppContext>, p: Principal, Json(params): Json<RunParams>) -> Result<Response> {
    p.require(Perm::SettingsManage)?;
    let settings = Settings::get(&ctx)?;
    if !settings.sso.enabled || !settings.master_sync.enabled {
        return unprocessable("Sinkronisasi master belum diaktifkan di konfigurasi.");
    }
    let kinds: &[&str] = match params.kind.as_str() {
        "students" => &["students"],
        "employees" => &["employees"],
        "all" => &["students", "employees"],
        _ => return unprocessable("`kind` harus students, employees, atau all."),
    };
    let incremental = match params.mode.as_deref() {
        None | Some("full") => false,
        Some("incremental") => true,
        Some(_) => return unprocessable("`mode` harus full atau incremental."),
    };
    if !rate_limit::allow(&format!("master-sync:{}", p.tenant_id()), 5, Duration::from_secs(600)) {
        return too_many_requests("Terlalu sering memicu sinkronisasi. Coba lagi beberapa menit lagi.");
    }

    let mut queued: Vec<&str> = Vec::new();
    for kind in kinds {
        if sync_runs::Model::is_running(&ctx.db, p.tenant_id(), kind).await.map_err(map_model)? {
            continue;
        }
        MasterSyncWorker::perform_later(&ctx, MasterSyncWorkerArgs { kind: (*kind).to_string(), incremental }).await?;
        queued.push(kind);
    }
    if queued.is_empty() {
        return conflict("Sinkronisasi yang diminta sedang berjalan.");
    }
    audit(&ctx, &p, "master.sync_trigger", "sync", None, Outcome::Success, json!({"kinds": queued, "incremental": incremental})).await?;
    format::render().status(StatusCode::ACCEPTED).header("cache-control", "no-store").json(json!({"queued": queued}))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/master-sync")
        .add("/", get(show))
        .add("/run", post(run))
}
