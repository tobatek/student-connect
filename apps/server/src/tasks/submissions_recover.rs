//! Pemulihan antrean pengiriman.
//!
//! * `QUEUED` > 10 menit: job mungkin hilang -> masukkan ulang ke antrean (aman: worker memakai CAS).
//! * `SENDING` > 30 menit: hasil tidak pasti (bisa saja sudah diterima SIMKATMAWA). TIDAK dikirim
//!   ulang otomatis demi mencegah data ganda; ditandai FAILED agar admin memeriksa dulu.

use chrono::{Duration, Utc};
use loco_rs::prelude::*;

use crate::{
    models::records::{self, status},
    workers::submit_simkatmawa::{SubmitSimkatmawaWorker, SubmitSimkatmawaWorkerArgs},
};

pub struct SubmissionsRecover;

#[async_trait]
impl Task for SubmissionsRecover {
    fn task(&self) -> TaskInfo {
        TaskInfo {
            name: "submissions:recover".to_string(),
            detail: "Pulihkan record QUEUED/SENDING yang macet. Jadwalkan tiap 10 menit.".to_string(),
        }
    }

    async fn run(&self, ctx: &AppContext, _vars: &task::Vars) -> Result<()> {
        let now = Utc::now();
        let stale_queued = records::Entity::find()
            .filter(records::Column::Status.eq(status::QUEUED))
            .filter(records::Column::UpdatedAt.lt((now - Duration::minutes(10)).fixed_offset()))
            .all(&ctx.db)
            .await?;
        for r in &stale_queued {
            SubmitSimkatmawaWorker::perform_later(ctx, SubmitSimkatmawaWorkerArgs { record_id: r.id }).await?;
        }

        let stale_sending = records::Entity::find()
            .filter(records::Column::Status.eq(status::SENDING))
            .filter(records::Column::UpdatedAt.lt((now - Duration::minutes(30)).fixed_offset()))
            .all(&ctx.db)
            .await?;
        for r in &stale_sending {
            records::Model::mark_error(
                &ctx.db,
                r.id,
                "Hasil pengiriman tidak pasti. Periksa dulu di SIMKATMAWA sebelum mengirim ulang.",
                false,
            )
            .await?;
        }
        tracing::info!(requeued = stale_queued.len(), uncertain = stale_sending.len(), "pemulihan antrean selesai");
        Ok(())
    }
}
