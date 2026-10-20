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
        master_data::{self, master_employees, master_students, ActiveFilter},
        sync_runs,
    },
    security::{principal::Principal, rate_limit, roles::Perm},
    settings::Settings,
    views::{MasterEmployeeView, MasterStudentView, Page, PageQuery, SyncRunView},
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

#[derive(Debug, Deserialize)]
struct ListParams {
    // Tanpa `#[serde(flatten)]`: dengan flatten, angka dari query string gagal di-parse.
    page: Option<u64>,
    page_size: Option<u64>,
    q: Option<String>,
    /// `active`, `inactive`, atau kosong untuk semua.
    status: Option<String>,
}

fn clean_search(q: Option<String>) -> Result<String> {
    let q = q.unwrap_or_default().trim().to_string();
    if q.chars().count() > 60 || q.chars().any(char::is_control) {
        return unprocessable("Kata kunci maksimal 60 karakter.");
    }
    Ok(q)
}

/// `GET /api/master-sync/students`: cache mahasiswa dari Portal (admin).
#[debug_handler]
async fn students(State(ctx): State<AppContext>, p: Principal, Query(params): Query<ListParams>) -> Result<Response> {
    p.require(Perm::SettingsManage)?;
    let (page, size) = PageQuery { page: params.page, page_size: params.page_size }.normalized();
    let q = clean_search(params.q)?;
    let filter = ActiveFilter::parse(params.status.as_deref());
    let (rows, total) = master_data::list_students(&ctx.db, p.tenant_id(), &q, filter, page, size).await?;
    format::render().header("cache-control", "no-store").json(Page::new(rows.iter().map(MasterStudentView::from).collect(), page, size, total))
}

/// `GET /api/master-sync/employees`: cache pegawai/dosen dari Portal (admin).
#[debug_handler]
async fn employees(State(ctx): State<AppContext>, p: Principal, Query(params): Query<ListParams>) -> Result<Response> {
    p.require(Perm::SettingsManage)?;
    let (page, size) = PageQuery { page: params.page, page_size: params.page_size }.normalized();
    let q = clean_search(params.q)?;
    let filter = ActiveFilter::parse(params.status.as_deref());
    let (rows, total) = master_data::list_employees(&ctx.db, p.tenant_id(), &q, filter, page, size).await?;
    format::render().header("cache-control", "no-store").json(Page::new(rows.iter().map(MasterEmployeeView::from).collect(), page, size, total))
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
        .add("/students", get(students))
        .add("/employees", get(employees))
}
