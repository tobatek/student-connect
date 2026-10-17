//! Log pengiriman SIMKATMAWA dan audit log (A.8.15).

use loco_rs::prelude::*;

use crate::{
    models::{audit_logs, submission_logs},
    security::{principal::Principal, roles::Perm},
    views::{AuditView, Page, PageQuery, SubmissionLogView},
};

use super::support::map_model;

#[debug_handler]
async fn submission_logs(State(ctx): State<AppContext>, p: Principal, Query(q): Query<PageQuery>) -> Result<Response> {
    p.require(Perm::LogsRead)?;
    let (page, size) = q.normalized();
    let (rows, total) = submission_logs::Model::page(&ctx.db, p.tenant_id(), page, size).await.map_err(map_model)?;
    format::json(Page::new(rows.iter().map(SubmissionLogView::from).collect(), page, size, total))
}

#[debug_handler]
async fn audit_log_page(State(ctx): State<AppContext>, p: Principal, Query(q): Query<PageQuery>) -> Result<Response> {
    p.require(Perm::AuditRead)?;
    let (page, size) = q.normalized();
    let (rows, total) = audit_logs::Model::page(&ctx.db, p.tenant_id(), page, size).await.map_err(map_model)?;
    format::json(Page::new(rows.iter().map(AuditView::from).collect(), page, size, total))
}

#[debug_handler]
async fn verify_chain(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    p.require(Perm::AuditRead)?;
    let report = audit_logs::Model::verify_chain(&ctx.db).await.map_err(map_model)?;
    format::json(report)
}

pub fn routes() -> Routes {
    Routes::new()
        .add("/api/submission-logs", get(submission_logs))
        .add("/api/audit-logs", get(audit_log_page))
        .add("/api/audit-logs/verify", get(verify_chain))
}
