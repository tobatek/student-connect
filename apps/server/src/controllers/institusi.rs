//! Laporan tahunan tata kelola kemahasiswaan (checklist indikator + isian angka).

use loco_rs::prelude::*;
use serde_json::json;

use super::support::{audit, map_model};
use crate::{
    errors::FieldErrors,
    models::{
        audit_logs::Outcome,
        institusi_reports::{self, valid_year, ReportInput},
    },
    security::{principal::Principal, roles::Perm},
    views::InstitusiView,
};

fn check_year(tahun: i32) -> Result<()> {
    if valid_year(tahun) {
        Ok(())
    } else {
        let mut e = FieldErrors::default();
        e.add("tahun", "Tahun tidak valid.");
        Err(e.into_error())
    }
}

#[debug_handler]
async fn show(State(ctx): State<AppContext>, p: Principal, Path(tahun): Path<i32>) -> Result<Response> {
    p.require(Perm::RecordRead)?;
    check_year(tahun)?;
    let view = institusi_reports::Model::find_for_year(&ctx.db, p.tenant_id(), tahun)
        .await
        .map_err(map_model)?
        .map_or_else(|| InstitusiView::empty(tahun), |r| InstitusiView::from(&r));
    format::json(view)
}

#[debug_handler]
async fn save(State(ctx): State<AppContext>, p: Principal, Path(tahun): Path<i32>, Json(input): Json<ReportInput>) -> Result<Response> {
    p.require(Perm::InstitusiWrite)?;
    check_year(tahun)?;
    let v = input.validate().map_err(|e| e.into_error())?;
    let finalize = v.finalize;
    let saved = institusi_reports::Model::upsert(&ctx.db, p.tenant_id(), tahun, p.user.id, v).await.map_err(map_model)?;
    audit(&ctx, &p, if finalize { "institusi.finalize" } else { "institusi.save_draft" }, "institusi", Some(tahun.to_string()), Outcome::Success, json!({"tahun": tahun})).await?;
    format::json(InstitusiView::from(&saved))
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/institusi")
        .add("/{tahun}", get(show))
        .add("/{tahun}", put(save))
}
