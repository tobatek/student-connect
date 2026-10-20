//! Sinkronisasi data master dari Portal ke cache lokal (`master_students`, `master_employees`).
//!
//! Aturan:
//! * Paginasi penuh dengan batas `max_pages`; jeda antar halaman; retry+backoff per halaman.
//! * Upsert berdasarkan NIM/NIP; baris tanpa perubahan inti tidak ditulis ulang.
//! * Penonaktifan hanya setelah lintasan penuh yang SELESAI TANPA GALAT fetch, dan dibatalkan bila
//!   terlalu banyak data aktif akan hilang sekaligus (sumber kosong/rusak jangan mengosongkan cache).
//! * Run inkremental (`updated_since`) tidak pernah menonaktifkan apa pun.
//! * Log hanya berisi hitungan; tidak ada data pribadi.

use std::time::Duration;

use chrono::{DateTime, FixedOffset, Utc};
use loco_rs::prelude::*;
use serde_json::json;

use crate::{
    integrations::portal::{Client, MasterKind, PortalError},
    models::{
        audit_logs::{self, Entry, Outcome},
        master_data::{self, Row, Table, Upsert},
        sync_runs::{self, Counters, Status, Trigger},
        tenants,
    },
    settings::Settings,
};

fn page_fingerprint(rows: &[serde_json::Value]) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    for row in rows {
        row.to_string().hash(&mut hasher);
    }
    hasher.finish()
}

const fn table_for(kind: MasterKind) -> Table {
    match kind {
        MasterKind::Students => Table::Students,
        MasterKind::Employees => Table::Employees,
    }
}

fn normalize(kind: MasterKind, raw: &serde_json::Value) -> Result<Row, &'static str> {
    match kind {
        MasterKind::Students => master_data::student_row(raw),
        MasterKind::Employees => master_data::employee_row(raw),
    }
}

/// Menjalankan satu sinkronisasi penuh (atau inkremental bila `incremental`).
///
/// # Errors
/// Galat konfigurasi, atau 409 bila sinkronisasi jenis yang sama sedang berjalan.
/// Kegagalan saat menarik data dicatat pada run (status FAILED) dan dikembalikan sebagai `Ok`.
pub async fn run(ctx: &AppContext, kind: MasterKind, trigger: Trigger, incremental: bool) -> Result<sync_runs::Model> {
    let settings = Settings::get(ctx)?;
    if !settings.sso.enabled || !settings.master_sync.enabled {
        return Err(Error::string("sinkronisasi master nonaktif (sso.enabled dan master_sync.enabled)"));
    }
    let tenant = tenants::Entity::find()
        .filter(tenants::Column::Slug.eq(settings.sso.tenant_slug.as_str()))
        .one(&ctx.db)
        .await?
        .ok_or_else(|| Error::string("sso.tenant_slug tidak ditemukan"))?;

    let client = Client::new(&settings.sso).map_err(|m| Error::string(&format!("klien Portal: {m}")))?;
    let updated_since: Option<String> = if incremental {
        sync_runs::Model::last_success_start(&ctx.db, tenant.id, kind.label())
            .await
            .map_err(Error::Model)?
            .map(|t| t.with_timezone(&Utc).to_rfc3339())
    } else {
        None
    };
    if incremental && updated_since.is_none() {
        return Err(Error::string("belum ada sinkronisasi penuh yang berhasil; jalankan mode penuh dulu"));
    }

    let run = sync_runs::Model::begin(&ctx.db, tenant.id, kind.label(), trigger)
        .await
        .map_err(|e| match e {
            ModelError::Message(ref m) if m.starts_with("conflict:") => crate::errors::conflict::<()>(m.trim_start_matches("conflict:"))
                .err()
                .unwrap_or(Error::InternalServerError),
            other => Error::Model(other),
        })?;
    let started: DateTime<FixedOffset> = run.started_at;

    let (counters, outcome) = pull(ctx, &client, &settings, kind, tenant.id, started, updated_since.as_deref(), incremental).await;
    let (status, note) = match &outcome {
        Pulled::Complete => (if counters.failed == 0 { Status::Success } else { Status::Partial }, None),
        Pulled::Incomplete(msg) => (Status::Partial, Some(msg.clone())),
        Pulled::Failed(msg) => (Status::Failed, Some(msg.clone())),
    };
    let finished = run.clone().into_active_model().finish(&ctx.db, status, counters, note.as_deref()).await.map_err(Error::Model)?;

    audit_logs::Model::record(
        &ctx.db,
        Entry {
            tenant_id: Some(tenant.id),
            actor: None,
            action: "master.sync",
            entity: kind.label(),
            entity_ref: Some(run.pid.to_string()),
            outcome: if status == Status::Failed { Outcome::Failure } else { Outcome::Success },
            ip: None,
            request_id: None,
            detail: json!({
                "trigger": trigger.as_str(), "incremental": incremental, "status": finished.status,
                "fetched": counters.fetched, "created": counters.created, "updated": counters.updated,
                "unchanged": counters.unchanged, "deactivated": counters.deactivated, "failed": counters.failed,
            }),
        },
    )
    .await
    .map_err(Error::Model)?;
    tracing::info!(
        kind = kind.label(), status = %finished.status, fetched = counters.fetched, created = counters.created,
        updated = counters.updated, unchanged = counters.unchanged, deactivated = counters.deactivated,
        failed = counters.failed, "sinkronisasi master selesai"
    );
    Ok(finished)
}

enum Pulled {
    /// Seluruh halaman terbaca.
    Complete,
    /// Selesai sebagian: data tersimpan, tetapi penonaktifan tidak dijalankan.
    Incomplete(String),
    /// Gagal menarik data dari Portal.
    Failed(String),
}

#[allow(clippy::too_many_arguments)]
async fn pull(
    ctx: &AppContext,
    client: &Client,
    settings: &Settings,
    kind: MasterKind,
    tenant_id: i64,
    started: DateTime<FixedOffset>,
    updated_since: Option<&str>,
    incremental: bool,
) -> (Counters, Pulled) {
    let sync = &settings.master_sync;
    let table = table_for(kind);
    let mut c = Counters::default();
    let mut page = 1u32;
    let mut previous_page: Option<u64> = None;

    let reached_end = loop {
        if page > sync.max_pages {
            break false;
        }
        let batch = match client.master_page(kind, page, sync, updated_since).await {
            Ok(b) => b,
            Err(e) => {
                let msg = match e {
                    PortalError::Auth => "Portal menolak token aplikasi (401/403).".to_string(),
                    other => other.describe(),
                };
                return (c, Pulled::Failed(format!("halaman {page}: {msg}")));
            }
        };

        // Portal yang mengabaikan `page` mengembalikan isi yang sama terus-menerus; tanpa ini loop jalan sampai `max_pages`.
        let fingerprint = page_fingerprint(&batch.rows);
        if previous_page == Some(fingerprint) {
            tracing::warn!(kind = kind.label(), page, "halaman identik dengan sebelumnya; paginasi Portal diabaikan, berhenti");
            break true;
        }
        previous_page = Some(fingerprint);

        let mut seen: Vec<String> = Vec::with_capacity(batch.rows.len());
        for raw in &batch.rows {
            c.fetched += 1;
            let row = match normalize(kind, raw) {
                Ok(r) => r,
                Err(reason) => {
                    c.failed += 1;
                    tracing::warn!(kind = kind.label(), page, reason, "baris master dilewati");
                    continue;
                }
            };
            match table.upsert(&ctx.db, tenant_id, &row, started).await {
                Ok(Upsert::Created) => c.created += 1,
                Ok(Upsert::Updated) => c.updated += 1,
                Ok(Upsert::Unchanged) => c.unchanged += 1,
                Err(e) => {
                    c.failed += 1;
                    tracing::warn!(kind = kind.label(), page, error = %e, "upsert baris master gagal");
                    continue;
                }
            }
            seen.push(row.key);
        }
        if let Err(e) = table.touch_seen(&ctx.db, tenant_id, &seen, started).await {
            return (c, Pulled::Failed(format!("halaman {page}: gagal menandai data terlihat ({e})")));
        }

        if !batch.has_more {
            break true;
        }
        page += 1;
        tokio::time::sleep(Duration::from_millis(sync.page_delay_ms)).await;
    };

    if !reached_end {
        return (c, Pulled::Incomplete(format!("berhenti di batas max_pages={}; penonaktifan dilewati", sync.max_pages)));
    }
    if incremental {
        return (c, Pulled::Complete);
    }
    // Hanya lintasan penuh tanpa galat fetch yang boleh menonaktifkan data yang hilang.
    match table.deactivation_preview(&ctx.db, tenant_id, started).await {
        Err(e) => (c, Pulled::Failed(format!("gagal menghitung penonaktifan ({e})"))),
        Ok((total, stale)) => {
            if stale == 0 {
                return (c, Pulled::Complete);
            }
            if stale * 100 > total * i64::from(sync.max_deactivate_percent) {
                return (
                    c,
                    Pulled::Incomplete(format!(
                        "penonaktifan dibatalkan: {stale} dari {total} data aktif akan hilang (batas {}%); periksa sumber",
                        sync.max_deactivate_percent
                    )),
                );
            }
            match table.deactivate_missing(&ctx.db, tenant_id, started).await {
                Ok(n) => {
                    c.deactivated = i32::try_from(n).unwrap_or(i32::MAX);
                    (c, Pulled::Complete)
                }
                Err(e) => (c, Pulled::Failed(format!("gagal menonaktifkan data hilang ({e})"))),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::page_fingerprint;

    #[test]
    fn identical_pages_share_a_fingerprint() {
        let a = vec![json!({"nim": "1"}), json!({"nim": "2"})];
        assert_eq!(page_fingerprint(&a), page_fingerprint(&a.clone()));
    }

    #[test]
    fn different_pages_or_order_differ() {
        let a = vec![json!({"nim": "1"}), json!({"nim": "2"})];
        let b = vec![json!({"nim": "3"}), json!({"nim": "4"})];
        let reversed = vec![json!({"nim": "2"}), json!({"nim": "1"})];
        assert_ne!(page_fingerprint(&a), page_fingerprint(&b));
        assert_ne!(page_fingerprint(&a), page_fingerprint(&reversed));
    }
}
