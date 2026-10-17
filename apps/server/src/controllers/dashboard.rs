//! Ringkasan dashboard sesuai hak akses (mahasiswa hanya melihat angka miliknya).

use loco_rs::prelude::*;
use serde::Serialize;

use super::support::map_model;
use crate::{
    models::{documents, kejuaraan, records, simkatmawa_credentials},
    security::principal::Principal,
    views::{CredentialStatusView, RecordView},
};

#[derive(Debug, Serialize)]
struct CountRow {
    kind: String,
    status: String,
    total: i64,
}

#[derive(Debug, Serialize)]
struct Dashboard {
    counts: Vec<CountRow>,
    kejuaraan_total: u64,
    documents_total: u64,
    simkatmawa: CredentialStatusView,
    recent: Vec<RecordView>,
}

#[debug_handler]
async fn show(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    let owner = p.role.sees_only_own().then_some(p.user.id);
    let counts = records::Model::counts(&ctx.db, p.tenant_id(), owner)
        .await
        .map_err(map_model)?
        .into_iter()
        .map(|(kind, status, total)| CountRow { kind, status, total })
        .collect();
    let kejuaraan_total = kejuaraan::Entity::find().filter(kejuaraan::Column::TenantId.eq(p.tenant_id())).count(&ctx.db).await?;
    let mut docs = documents::Entity::find().filter(documents::Column::TenantId.eq(p.tenant_id()));
    if let Some(owner) = owner {
        docs = docs.filter(documents::Column::UploadedBy.eq(owner));
    }
    let documents_total = docs.count(&ctx.db).await?;
    let cred = simkatmawa_credentials::Model::find_for_tenant(&ctx.db, p.tenant_id()).await.map_err(map_model)?;

    let mut recent = records::Entity::find().filter(records::Column::TenantId.eq(p.tenant_id()));
    if let Some(owner) = owner {
        recent = recent.filter(records::Column::CreatedBy.eq(owner));
    }
    let recent_rows = recent.order_by_desc(records::Column::CreatedAt).paginate(&ctx.db, 6).fetch_page(0).await?;

    format::json(Dashboard {
        counts,
        kejuaraan_total,
        documents_total,
        simkatmawa: CredentialStatusView::from_model(cred.as_ref()),
        recent: recent_rows.iter().map(RecordView::from).collect(),
    })
}

pub fn routes() -> Routes {
    Routes::new().add("/api/dashboard", get(show))
}
