//! Menerapkan idle timeout Portal pada sesi lokal (poll-based; Portal tidak bisa memanggil balik).
//!
//! Untuk setiap pengguna tertaut Portal yang punya sesi lokal aktif, tanyakan
//! `/api/sso/session-status`. Bila `active=false`, semua sesi lokalnya dicabut. Galat jaringan
//! TIDAK mencabut sesi (timeout lokal tetap berlaku), agar Portal down tidak menendang semua orang.

use std::time::Duration;

use chrono::Utc;
use loco_rs::prelude::*;
use serde_json::json;

use crate::{
    integrations::portal::Client,
    models::{
        audit_logs::{self, Entry, Outcome},
        sessions, users,
    },
    settings::Settings,
};

/// Batas per putaran agar satu run tidak berjalan tanpa akhir.
const MAX_USERS_PER_RUN: usize = 500;

pub struct SsoSessionsCheck;

#[async_trait]
impl Task for SsoSessionsCheck {
    fn task(&self) -> TaskInfo {
        TaskInfo {
            name: "sso:sessions-check".to_string(),
            detail: "Cabut sesi lokal pengguna yang sudah tidak aktif di Portal. Jadwalkan tiap 2-5 menit.".to_string(),
        }
    }

    async fn run(&self, ctx: &AppContext, _vars: &task::Vars) -> Result<()> {
        let settings = Settings::get(ctx)?;
        if !settings.sso.enabled || !settings.sso.session_check_enabled {
            return Ok(());
        }
        let client = Client::new(&settings.sso).map_err(|m| Error::string(&format!("klien Portal: {m}")))?;

        let now = Utc::now();
        let live = sessions::Entity::find()
            .filter(sessions::Column::RevokedAt.is_null())
            .filter(sessions::Column::ExpiresAt.gt(now.fixed_offset()))
            .filter(
                sessions::Column::LastSeenAt
                    .gt((now - chrono::Duration::minutes(settings.session.idle_minutes)).fixed_offset()),
            )
            .all(&ctx.db)
            .await?;
        let mut user_ids: Vec<i64> = live.iter().map(|s| s.user_id).collect();
        user_ids.sort_unstable();
        user_ids.dedup();
        user_ids.truncate(MAX_USERS_PER_RUN);
        if user_ids.is_empty() {
            return Ok(());
        }

        let linked = users::Entity::find()
            .filter(users::Column::Id.is_in(user_ids))
            .filter(users::Column::PortalUserId.is_not_null())
            .all(&ctx.db)
            .await?;

        let (mut checked, mut revoked, mut errors) = (0u32, 0u32, 0u32);
        for user in &linked {
            checked += 1;
            match client.session_active(&user.email).await {
                Ok(true) => {}
                Ok(false) => {
                    sessions::Model::revoke_all(&ctx.db, user.id).await.map_err(Error::Model)?;
                    revoked += 1;
                    audit_logs::Model::record(
                        &ctx.db,
                        Entry {
                            tenant_id: Some(user.tenant_id),
                            actor: None,
                            action: "auth.sso_session_expired",
                            entity: "user",
                            entity_ref: Some(user.pid.to_string()),
                            outcome: Outcome::Success,
                            ip: None,
                            request_id: None,
                            detail: json!({"reason": "portal_idle_timeout"}),
                        },
                    )
                    .await
                    .map_err(Error::Model)?;
                }
                Err(e) => {
                    errors += 1;
                    tracing::warn!(detail = %e.describe(), "cek sesi Portal gagal; sesi lokal dipertahankan");
                }
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        tracing::info!(checked, revoked, errors, "cek sesi SSO selesai");
        Ok(())
    }
}
