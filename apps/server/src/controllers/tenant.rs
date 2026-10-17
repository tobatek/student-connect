//! Profil Perguruan Tinggi (tenant).

use loco_rs::prelude::*;
use serde::Deserialize;
use serde_json::json;

use crate::{
    errors::FieldErrors,
    models::{audit_logs::Outcome, tenants},
    security::{principal::Principal, roles::Perm},
    views::TenantView,
};

use super::support::{audit, map_model};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateTenant {
    nama_pt: String,
    kode_pt: String,
    tahun_aktif: i32,
    allow_kab_rekognisi: bool,
}

#[debug_handler]
async fn show(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    let tenant = tenants::Model::find_by_id(&ctx.db, p.tenant_id()).await.map_err(map_model)?;
    format::json(TenantView::from(&tenant))
}

#[debug_handler]
async fn update(State(ctx): State<AppContext>, p: Principal, Json(params): Json<UpdateTenant>) -> Result<Response> {
    p.require(Perm::TenantManage)?;
    let mut errors = FieldErrors::default();
    let nama = params.nama_pt.trim().to_string();
    let kode = params.kode_pt.trim().to_string();
    if nama.is_empty() || nama.chars().count() > 200 || nama.chars().any(char::is_control) {
        errors.add("nama_pt", "Wajib diisi (maks 200 karakter).");
    }
    if kode.is_empty() || kode.len() > 16 || !kode.bytes().all(|b| b.is_ascii_alphanumeric()) {
        errors.add("kode_pt", "Kode PT 1-16 karakter alfanumerik.");
    }
    if !(2000..=2100).contains(&params.tahun_aktif) {
        errors.add("tahun_aktif", "Tahun tidak valid.");
    }
    errors.into_result()?;

    let tenant = tenants::Model::find_by_id(&ctx.db, p.tenant_id()).await.map_err(map_model)?;
    let mut am = tenant.into_active_model();
    am.nama_pt = ActiveValue::set(nama);
    am.kode_pt = ActiveValue::set(kode);
    am.tahun_aktif = ActiveValue::set(params.tahun_aktif);
    am.allow_kab_rekognisi = ActiveValue::set(params.allow_kab_rekognisi);
    let saved = am.update(&ctx.db).await?;
    audit(&ctx, &p, "tenant.update", "tenant", Some(saved.pid.to_string()), Outcome::Success, json!({"tahun_aktif": saved.tahun_aktif})).await?;
    format::json(TenantView::from(&saved))
}

pub fn routes() -> Routes {
    Routes::new().prefix("/api/tenant").add("/", get(show)).add("/", put(update))
}
