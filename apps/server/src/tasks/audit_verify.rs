use loco_rs::prelude::*;

use crate::models::audit_logs;

pub struct AuditVerify;

#[async_trait]
impl Task for AuditVerify {
    fn task(&self) -> TaskInfo {
        TaskInfo {
            name: "audit:verify".to_string(),
            detail: "Verifikasi rantai hash audit log. Gagal (exit non-zero) bila ada baris yang diubah.".to_string(),
        }
    }

    async fn run(&self, ctx: &AppContext, _vars: &task::Vars) -> Result<()> {
        let report = audit_logs::Model::verify_chain(&ctx.db).await?;
        if report.intact {
            println!("Rantai audit utuh ({} baris diperiksa).", report.checked);
            Ok(())
        } else {
            Err(Error::string(&format!(
                "RANTAI AUDIT RUSAK mulai id {:?} setelah {} baris valid",
                report.first_broken_id, report.checked
            )))
        }
    }
}
