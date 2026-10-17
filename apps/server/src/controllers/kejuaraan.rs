//! Laporan kejuaraan/ajang/lomba (hanya web SIMKATMAWA, tanpa API).

use loco_rs::prelude::*;
use serde_json::json;

use super::support::{audit, created, map_model};
use crate::{
    models::{
        audit_logs::Outcome,
        kejuaraan::{self, KejuaraanInput},
    },
    security::{principal::Principal, roles::Perm},
    views::{KejuaraanView, Page, PageQuery},
};

#[debug_handler]
async fn list(State(ctx): State<AppContext>, p: Principal, Query(q): Query<PageQuery>) -> Result<Response> {
    p.require(Perm::RecordRead)?;
    let (page, size) = q.normalized();
    let (rows, total) = kejuaraan::Model::list(&ctx.db, p.tenant_id(), page, size).await.map_err(map_model)?;
    format::json(Page::new(rows.iter().map(KejuaraanView::from).collect(), page, size, total))
}

#[debug_handler]
async fn show(State(ctx): State<AppContext>, p: Principal, Path(id): Path<Uuid>) -> Result<Response> {
    p.require(Perm::RecordRead)?;
    let row = kejuaraan::Model::find_in_tenant(&ctx.db, p.tenant_id(), id).await.map_err(map_model)?;
    format::json(KejuaraanView::from(&row))
}

#[debug_handler]
async fn create(State(ctx): State<AppContext>, p: Principal, Json(input): Json<KejuaraanInput>) -> Result<Response> {
    p.require(Perm::EventWrite)?;
    let v = input.validate().map_err(|e| e.into_error())?;
    let row = kejuaraan::Model::create(&ctx.db, p.tenant_id(), p.user.id, v).await.map_err(map_model)?;
    audit(&ctx, &p, "kejuaraan.create", "kejuaraan", Some(row.pid.to_string()), Outcome::Success, json!({})).await?;
    created(&KejuaraanView::from(&row))
}

#[debug_handler]
async fn update(State(ctx): State<AppContext>, p: Principal, Path(id): Path<Uuid>, Json(input): Json<KejuaraanInput>) -> Result<Response> {
    p.require(Perm::EventWrite)?;
    let v = input.validate().map_err(|e| e.into_error())?;
    let row = kejuaraan::Model::find_in_tenant(&ctx.db, p.tenant_id(), id).await.map_err(map_model)?;
    let saved = row.into_active_model().apply(&ctx.db, v).await.map_err(map_model)?;
    audit(&ctx, &p, "kejuaraan.update", "kejuaraan", Some(saved.pid.to_string()), Outcome::Success, json!({})).await?;
    format::json(KejuaraanView::from(&saved))
}

#[debug_handler]
async fn remove(State(ctx): State<AppContext>, p: Principal, Path(id): Path<Uuid>) -> Result<Response> {
    p.require(Perm::EventWrite)?;
    let row = kejuaraan::Model::find_in_tenant(&ctx.db, p.tenant_id(), id).await.map_err(map_model)?;
    kejuaraan::Entity::delete_by_id(row.id).exec(&ctx.db).await?;
    audit(&ctx, &p, "kejuaraan.delete", "kejuaraan", Some(id.to_string()), Outcome::Success, json!({})).await?;
    format::empty_json()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/kejuaraan")
        .add("/", get(list))
        .add("/", post(create))
        .add("/{id}", get(show))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
}
