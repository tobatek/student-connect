use loco_rs::prelude::*;

use crate::models::sessions;

pub struct SessionsPurge;

#[async_trait]
impl Task for SessionsPurge {
    fn task(&self) -> TaskInfo {
        TaskInfo {
            name: "sessions:purge".to_string(),
            detail: "Hapus sesi kedaluwarsa/dicabut (>7 hari). Jadwalkan harian.".to_string(),
        }
    }

    async fn run(&self, ctx: &AppContext, _vars: &task::Vars) -> Result<()> {
        let removed = sessions::Model::purge(&ctx.db).await?;
        tracing::info!(removed, "sesi lama dibersihkan");
        Ok(())
    }
}
