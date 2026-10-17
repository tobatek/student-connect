//! Pengiriman satu record ke SIMKATMAWA di luar siklus request.
//!
//! Idempotensi: transisi `QUEUED -> SENDING` adalah compare-and-set; hanya satu worker yang
//! berhasil, job duplikat langsung selesai tanpa mengirim. Dokumen terkunci setelah sukses.

use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    integrations::simkatmawa::{self, CallError, Client},
    models::{
        audit_logs::{self, Entry, Outcome},
        documents, enum_mappings, records,
        simkatmawa_credentials,
        submission_logs::{self, NewLog},
    },
    security::url_guard,
    settings::{self, Settings},
};

/// Setelah batas ini record ditandai FAILED dan menunggu tindakan admin.
pub const MAX_ATTEMPTS: i32 = 5;

pub struct SubmitSimkatmawaWorker {
    pub ctx: AppContext,
}

#[derive(Deserialize, Debug, Serialize)]
pub struct SubmitSimkatmawaWorkerArgs {
    pub record_id: i64,
}

#[async_trait]
impl BackgroundWorker<SubmitSimkatmawaWorkerArgs> for SubmitSimkatmawaWorker {
    fn build(ctx: &AppContext) -> Self {
        Self { ctx: ctx.clone() }
    }

    async fn perform(&self, args: SubmitSimkatmawaWorkerArgs) -> Result<()> {
        let db = &self.ctx.db;
        let Some(record) = records::Model::begin_sending(db, args.record_id).await? else {
            tracing::info!(record_id = args.record_id, "lewati: record bukan QUEUED (job duplikat)");
            return Ok(());
        };
        let outcome = self.deliver(&record).await;
        self.finish(&record, outcome).await
    }
}

enum Delivery {
    Sent(simkatmawa::SubmitOk),
    /// Tidak bisa dikirim dan tidak ada gunanya diulang otomatis.
    Permanent(String, Option<i32>),
    Transient(String),
}

impl SubmitSimkatmawaWorker {
    async fn deliver(&self, record: &records::Model) -> Delivery {
        match self.try_deliver(record).await {
            Ok(d) => d,
            Err(e) => Delivery::Transient(format!("galat internal: {e}")),
        }
    }

    async fn try_deliver(&self, record: &records::Model) -> Result<Delivery> {
        let db = &self.ctx.db;
        let settings = Settings::get(&self.ctx)?;
        let vault = settings::vault(&self.ctx)?;
        let Some(cred) = simkatmawa_credentials::Model::find_for_tenant(db, record.tenant_id).await? else {
            return Ok(Delivery::Permanent("Kredensial SIMKATMAWA belum diatur.".into(), None));
        };
        let base = match url_guard::outbound_api(&cred.api_url, &settings.simkatmawa.allowed_hosts) {
            Ok(url) => url,
            Err(msg) => return Ok(Delivery::Permanent(msg.to_string(), None)),
        };
        let client = Client::new(base, Duration::from_secs(settings.simkatmawa.timeout_seconds))
            .map_err(Error::Message)?;
        let overrides = enum_mappings::Model::list(db, record.tenant_id).await?;
        let kind = records::Kind::parse(&record.kind)
            .ok_or_else(|| Error::Message("jenis record tidak dikenal".into()))?;
        let payload = simkatmawa::build_payload(record, &overrides);

        let mut token = cred.valid_token(&vault);
        let mut relogged = false;
        loop {
            let current = match token.take() {
                Some(t) => t,
                None => {
                    let password = cred
                        .password(&vault)
                        .map_err(|e| Error::Message(e.to_string()))?;
                    match client.login(&cred.email, &password).await {
                        Ok(ok) => {
                            cred.clone()
                                .into_active_model()
                                .store_token(
                                    db,
                                    &vault,
                                    record.tenant_id,
                                    &ok.token,
                                    Utc::now() + ChronoDuration::minutes(simkatmawa::ASSUMED_TOKEN_TTL_MINUTES),
                                )
                                .await?;
                            relogged = true;
                            ok.token
                        }
                        Err(CallError::Auth) => {
                            cred.clone()
                                .into_active_model()
                                .record_failure(db, "Login ditolak SIMKATMAWA.")
                                .await?;
                            return Ok(Delivery::Permanent("Login SIMKATMAWA ditolak; perbarui kredensial.".into(), None));
                        }
                        Err(e) => return Ok(Delivery::Transient(e.describe())),
                    }
                }
            };
            match client.submit(kind.api_path(), &current, &payload).await {
                Ok(ok) => return Ok(Delivery::Sent(ok)),
                Err(CallError::Auth) if !relogged => {} // token usang: login ulang sekali
                Err(CallError::Auth) => {
                    return Ok(Delivery::Transient("Token ditolak setelah login ulang.".into()));
                }
                Err(CallError::Rejected { status, message }) => {
                    return Ok(Delivery::Permanent(
                        format!("SIMKATMAWA menolak data (HTTP {status}): {message}"),
                        Some(i32::from(status)),
                    ));
                }
                Err(CallError::Transient(m)) => return Ok(Delivery::Transient(m)),
                // Data mungkin sudah diterima: berhenti di FAILED agar admin memeriksa dulu (anti data ganda).
                Err(e @ CallError::Uncertain(_)) => return Ok(Delivery::Permanent(e.describe(), None)),
            }
        }
    }

    async fn finish(&self, record: &records::Model, delivery: Delivery) -> Result<()> {
        let db = &self.ctx.db;
        let kind = record.kind.clone();
        let summary = simkatmawa::summarize(&simkatmawa::build_payload(record, &[]));
        let log = |outcome: &'static str, http: Option<i32>, resp: serde_json::Value, err: Option<String>| NewLog {
            tenant_id: record.tenant_id,
            record_id: record.id,
            kind: kind.clone(),
            attempt: record.submission_attempts,
            outcome,
            http_status: http,
            request_summary: summary.clone(),
            response_summary: resp,
            error: err,
            idempotency_key: record.idempotency_key,
        };
        let audit = |action: &'static str, outcome: Outcome, detail: serde_json::Value| Entry {
            tenant_id: Some(record.tenant_id),
            actor: None,
            action,
            entity: "record",
            entity_ref: Some(record.pid.to_string()),
            outcome,
            ip: None,
            request_id: None,
            detail,
        };
        match delivery {
            Delivery::Sent(ok) => {
                records::Model::mark_sent(db, record.id, &ok.simkatmawa_id, ok.kode_pt.as_deref(), ok.tahun.as_deref()).await?;
                documents::Model::lock_for_record(db, record.tenant_id, &record.pid.to_string()).await?;
                submission_logs::Model::append(
                    db,
                    log("SUCCESS", Some(i32::from(ok.http_status)), json!({"id": ok.simkatmawa_id, "message": ok.message}), None),
                )
                .await?;
                audit_logs::Model::record(db, audit("simkatmawa.submit", Outcome::Success, json!({"simkatmawa_id": ok.simkatmawa_id, "kind": kind})))
                    .await?;
                Ok(())
            }
            Delivery::Permanent(message, http) => {
                records::Model::mark_error(db, record.id, &message, false).await?;
                submission_logs::Model::append(db, log("FAILED", http, json!({}), Some(message.clone()))).await?;
                audit_logs::Model::record(db, audit("simkatmawa.submit", Outcome::Failure, json!({"reason": message}))).await?;
                Ok(())
            }
            Delivery::Transient(message) => {
                let exhausted = record.submission_attempts >= MAX_ATTEMPTS;
                records::Model::mark_error(db, record.id, &message, !exhausted).await?;
                submission_logs::Model::append(
                    db,
                    log(if exhausted { "FAILED" } else { "RETRY" }, None, json!({}), Some(message.clone())),
                )
                .await?;
                if exhausted {
                    audit_logs::Model::record(db, audit("simkatmawa.submit", Outcome::Failure, json!({"reason": message, "attempts": record.submission_attempts}))).await?;
                    Ok(())
                } else {
                    // Biarkan antrean mengulang sesuai kebijakan retry-nya.
                    Err(Error::Worker(message))
                }
            }
        }
    }
}
