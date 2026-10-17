//! Sinkronisasi data master dari Portal lewat CLI/scheduler.
//!
//! * `cargo loco task sync:master`                      -> mahasiswa lalu pegawai, penuh
//! * `cargo loco task sync:master kind:students`         -> hanya mahasiswa
//! * `cargo loco task sync:master mode:incremental`      -> hanya yang berubah sejak run SUCCESS terakhir

use loco_rs::prelude::*;

use crate::{
    integrations::{portal::MasterKind, portal_sync},
    models::sync_runs::Trigger,
};

pub struct SyncMaster;

#[async_trait]
impl Task for SyncMaster {
    fn task(&self) -> TaskInfo {
        TaskInfo {
            name: "sync:master".to_string(),
            detail: "Tarik data mahasiswa & pegawai dari Portal.\nUsage: cargo loco task sync:master [kind:students|employees|all] [mode:full|incremental]. Jadwalkan harian.".to_string(),
        }
    }

    async fn run(&self, ctx: &AppContext, vars: &task::Vars) -> Result<()> {
        let settings = crate::settings::Settings::get(ctx)?;
        if !settings.sso.enabled || !settings.master_sync.enabled {
            tracing::info!("sync:master dilewati: sso.enabled/master_sync.enabled belum aktif");
            return Ok(());
        }
        let kinds: &[MasterKind] = match vars.cli_arg("kind") {
            Err(_) | Ok("all") => &[MasterKind::Students, MasterKind::Employees],
            Ok("students") => &[MasterKind::Students],
            Ok("employees") => &[MasterKind::Employees],
            Ok(_) => return Err(Error::string("kind harus students, employees, atau all")),
        };
        let incremental = match vars.cli_arg("mode") {
            Err(_) | Ok("full") => false,
            Ok("incremental") => true,
            Ok(_) => return Err(Error::string("mode harus full atau incremental")),
        };
        // Satu jenis gagal tidak boleh menghentikan jenis lain; kembalikan galat di akhir.
        let mut failures = 0;
        for kind in kinds {
            match portal_sync::run(ctx, *kind, Trigger::Task, incremental).await {
                Ok(run) => println!("{}: {} (diambil {}, baru {}, berubah {}, tetap {}, nonaktif {}, gagal {})",
                    run.kind, run.status, run.fetched, run.created, run.updated, run.unchanged, run.deactivated, run.failed),
                Err(e) => {
                    failures += 1;
                    tracing::error!(kind = kind.label(), error = %e, "sinkronisasi master tidak dapat dijalankan");
                }
            }
        }
        if failures > 0 {
            return Err(Error::string("sebagian sinkronisasi master tidak dapat dijalankan; lihat log"));
        }
        Ok(())
    }
}
