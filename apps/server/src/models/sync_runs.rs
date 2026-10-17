//! Log sinkronisasi data master. Hanya hitungan dan status; tidak ada data pribadi di sini.

use chrono::{Duration, Utc};
use loco_rs::prelude::*;
use sea_orm::SqlErr;

pub use super::_entities::sync_runs::{self, ActiveModel, Column, Entity, Model};

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trigger {
    Schedule,
    Manual,
    Task,
}

impl Trigger {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Schedule => "schedule",
            Self::Manual => "manual",
            Self::Task => "task",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Success,
    /// Selesai, tetapi ada baris gagal atau penonaktifan dibatalkan pengaman.
    Partial,
    Failed,
}

impl Status {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Success => "SUCCESS",
            Self::Partial => "PARTIAL",
            Self::Failed => "FAILED",
        }
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct Counters {
    pub fetched: i32,
    pub created: i32,
    pub updated: i32,
    pub unchanged: i32,
    pub deactivated: i32,
    pub failed: i32,
}

/// RUNNING yang lebih lama dari ini dianggap macet (proses mati) dan ditutup sebagai FAILED.
const STALE_HOURS: i64 = 2;

impl Model {
    /// Membuka run baru. Indeks unik parsial menjamin hanya satu RUNNING per tenant+jenis.
    ///
    /// # Errors
    /// `Message("conflict:...")` bila sudah ada sinkronisasi berjalan.
    pub async fn begin(db: &DatabaseConnection, tenant_id: i64, kind: &str, trigger: Trigger) -> ModelResult<Self> {
        Self::expire_stale(db, tenant_id).await?;
        let inserted = ActiveModel {
            pid: ActiveValue::set(Uuid::new_v4()),
            tenant_id: ActiveValue::set(tenant_id),
            kind: ActiveValue::set(kind.to_string()),
            triggered_by: ActiveValue::set(trigger.as_str().to_string()),
            status: ActiveValue::set("RUNNING".to_string()),
            ..Default::default()
        }
        .insert(db)
        .await;
        match inserted {
            Ok(run) => Ok(run),
            Err(e) if matches!(e.sql_err(), Some(SqlErr::UniqueConstraintViolation(_))) => {
                Err(ModelError::Message("conflict:Sinkronisasi jenis ini sedang berjalan.".to_string()))
            }
            Err(e) => Err(e.into()),
        }
    }

    /// # Errors
    /// Galat database.
    pub async fn expire_stale(db: &DatabaseConnection, tenant_id: i64) -> ModelResult<()> {
        let cutoff = (Utc::now() - Duration::hours(STALE_HOURS)).fixed_offset();
        Entity::update_many()
            .col_expr(Column::Status, sea_orm::sea_query::Expr::value("FAILED"))
            .col_expr(Column::Note, sea_orm::sea_query::Expr::value("Kedaluwarsa: proses berhenti sebelum selesai."))
            .col_expr(Column::FinishedAt, sea_orm::sea_query::Expr::current_timestamp())
            .filter(Column::TenantId.eq(tenant_id))
            .filter(Column::Status.eq("RUNNING"))
            .filter(Column::StartedAt.lt(cutoff))
            .exec(db)
            .await?;
        Ok(())
    }

    /// # Errors
    /// Galat database.
    pub async fn is_running(db: &DatabaseConnection, tenant_id: i64, kind: &str) -> ModelResult<bool> {
        Ok(Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .filter(Column::Kind.eq(kind))
            .filter(Column::Status.eq("RUNNING"))
            .filter(Column::StartedAt.gt((Utc::now() - Duration::hours(STALE_HOURS)).fixed_offset()))
            .one(db)
            .await?
            .is_some())
    }

    /// # Errors
    /// Galat database.
    pub async fn recent(db: &DatabaseConnection, tenant_id: i64, limit: u64) -> ModelResult<Vec<Self>> {
        Ok(Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .order_by_desc(Column::StartedAt)
            .limit(limit)
            .all(db)
            .await?)
    }

    /// Awal run SUCCESS terakhir (batas bawah `updated_since` untuk sinkronisasi inkremental).
    ///
    /// # Errors
    /// Galat database.
    pub async fn last_success_start(
        db: &DatabaseConnection,
        tenant_id: i64,
        kind: &str,
    ) -> ModelResult<Option<chrono::DateTime<chrono::FixedOffset>>> {
        Ok(Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .filter(Column::Kind.eq(kind))
            .filter(Column::Status.eq("SUCCESS"))
            .order_by_desc(Column::StartedAt)
            .one(db)
            .await?
            .map(|r| r.started_at))
    }
}

impl ActiveModel {
    /// # Errors
    /// Galat database.
    pub async fn finish(mut self, db: &DatabaseConnection, status: Status, c: Counters, note: Option<&str>) -> ModelResult<Model> {
        self.status = ActiveValue::set(status.as_str().to_string());
        self.fetched = ActiveValue::set(c.fetched);
        self.created = ActiveValue::set(c.created);
        self.updated = ActiveValue::set(c.updated);
        self.unchanged = ActiveValue::set(c.unchanged);
        self.deactivated = ActiveValue::set(c.deactivated);
        self.failed = ActiveValue::set(c.failed);
        self.note = ActiveValue::set(note.map(|n| n.chars().take(300).collect()));
        self.finished_at = ActiveValue::set(Some(Utc::now().fixed_offset()));
        Ok(self.update(db).await?)
    }
}
