//! Sinkronisasi data master di luar siklus request (tombol "Sinkron sekarang").

use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};

use crate::{
    integrations::{portal::MasterKind, portal_sync},
    models::sync_runs::Trigger,
};

pub struct MasterSyncWorker {
    pub ctx: AppContext,
}

#[derive(Deserialize, Debug, Serialize)]
pub struct MasterSyncWorkerArgs {
    /// `students` atau `employees`.
    pub kind: String,
    pub incremental: bool,
}

#[must_use]
pub fn parse_kind(value: &str) -> Option<MasterKind> {
    match value {
        "students" => Some(MasterKind::Students),
        "employees" => Some(MasterKind::Employees),
        _ => None,
    }
}

#[async_trait]
impl BackgroundWorker<MasterSyncWorkerArgs> for MasterSyncWorker {
    fn build(ctx: &AppContext) -> Self {
        Self { ctx: ctx.clone() }
    }

    async fn perform(&self, args: MasterSyncWorkerArgs) -> Result<()> {
        let Some(kind) = parse_kind(&args.kind) else {
            tracing::warn!("job sinkronisasi dengan jenis tak dikenal diabaikan");
            return Ok(());
        };
        match portal_sync::run(&self.ctx, kind, Trigger::Manual, args.incremental).await {
            Ok(_) => Ok(()),
            // Dua job bersamaan: yang kalah selesai tanpa galat, hasil ada di log run pemenang.
            Err(Error::CustomError(status, _)) if status == axum::http::StatusCode::CONFLICT => Ok(()),
            Err(e) => {
                tracing::error!(error = %e, "sinkronisasi master manual gagal dimulai");
                Ok(())
            }
        }
    }
}
