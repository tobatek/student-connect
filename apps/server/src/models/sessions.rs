//! Sesi sisi-server. Cookie hanya memuat token acak 48 karakter; database hanya menyimpan
//! hash SHA-256-nya, sehingga kebocoran tabel tidak membocorkan sesi aktif (A.5.15, A.8.5).

use chrono::{Duration, Utc};
use loco_rs::{hash, prelude::*};
use sha2::{Digest, Sha256};

pub use super::_entities::sessions::{self, ActiveModel, Column, Entity, Model};

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

pub struct Issued {
    /// Token mentah: hanya dikirim sekali lewat cookie HttpOnly.
    pub token: String,
    pub session: Model,
}

#[must_use]
pub fn hash_token(raw: &str) -> String {
    let digest = Sha256::digest(raw.as_bytes());
    digest.iter().fold(String::with_capacity(64), |mut acc, b| {
        use std::fmt::Write;
        let _ = write!(acc, "{b:02x}");
        acc
    })
}

fn clip(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

impl Model {
    /// Menerbitkan sesi baru (selalu token baru: anti session fixation) dan mencabut
    /// sesi tertua bila melebihi batas per pengguna.
    ///
    /// # Errors
    /// Galat database.
    pub async fn issue(
        db: &DatabaseConnection,
        user_id: i64,
        ip: Option<&str>,
        user_agent: Option<&str>,
        absolute_hours: i64,
        max_sessions: u64,
    ) -> ModelResult<Issued> {
        let token = hash::random_string(48);
        let now = Utc::now();
        let session = ActiveModel {
            user_id: ActiveValue::set(user_id),
            token_hash: ActiveValue::set(hash_token(&token)),
            csrf_token: ActiveValue::set(hash::random_string(40)),
            ip: ActiveValue::set(ip.map(|v| clip(v, 64))),
            user_agent: ActiveValue::set(user_agent.map(|v| clip(v, 256))),
            last_seen_at: ActiveValue::set(now.fixed_offset()),
            expires_at: ActiveValue::set((now + Duration::hours(absolute_hours)).fixed_offset()),
            ..Default::default()
        }
        .insert(db)
        .await?;

        let active = Entity::find()
            .filter(Column::UserId.eq(user_id))
            .filter(Column::RevokedAt.is_null())
            .filter(Column::ExpiresAt.gt(now.fixed_offset()))
            .order_by_desc(Column::CreatedAt)
            .all(db)
            .await?;
        if active.len() as u64 > max_sessions {
            let stale: Vec<i64> = active
                .iter()
                .skip(usize::try_from(max_sessions).unwrap_or(usize::MAX))
                .map(|s| s.id)
                .collect();
            Entity::update_many()
                .col_expr(Column::RevokedAt, sea_orm::sea_query::Expr::current_timestamp().into())
                .filter(Column::Id.is_in(stale))
                .exec(db)
                .await?;
        }
        Ok(Issued { token, session })
    }

    /// Sesi aktif = belum dicabut, belum melewati batas absolut, dan tidak idle terlalu lama.
    ///
    /// # Errors
    /// `EntityNotFound` bila tidak ada sesi aktif untuk token tersebut.
    pub async fn find_active(
        db: &DatabaseConnection,
        raw_token: &str,
        idle_minutes: i64,
    ) -> ModelResult<Self> {
        let now = Utc::now();
        Entity::find()
            .filter(Column::TokenHash.eq(hash_token(raw_token)))
            .filter(Column::RevokedAt.is_null())
            .filter(Column::ExpiresAt.gt(now.fixed_offset()))
            .filter(Column::LastSeenAt.gt((now - Duration::minutes(idle_minutes)).fixed_offset()))
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)
    }

    /// Mencabut semua sesi pengguna (ganti kata sandi, nonaktifkan akun).
    ///
    /// # Errors
    /// Galat database.
    pub async fn revoke_all(db: &DatabaseConnection, user_id: i64) -> ModelResult<()> {
        Entity::update_many()
            .col_expr(Column::RevokedAt, sea_orm::sea_query::Expr::current_timestamp().into())
            .filter(Column::UserId.eq(user_id))
            .filter(Column::RevokedAt.is_null())
            .exec(db)
            .await?;
        Ok(())
    }

    /// Menghapus sesi yang sudah kedaluwarsa/dicabut lebih dari 7 hari.
    ///
    /// # Errors
    /// Galat database.
    pub async fn purge(db: &DatabaseConnection) -> ModelResult<u64> {
        let cutoff = (Utc::now() - Duration::days(7)).fixed_offset();
        let res = Entity::delete_many()
            .filter(
                Condition::any()
                    .add(Column::ExpiresAt.lt(cutoff))
                    .add(Column::RevokedAt.lt(cutoff)),
            )
            .exec(db)
            .await?;
        Ok(res.rows_affected)
    }
}

impl ActiveModel {
    /// # Errors
    /// Galat database.
    pub async fn touch(mut self, db: &DatabaseConnection) -> ModelResult<Model> {
        self.last_seen_at = ActiveValue::set(Utc::now().fixed_offset());
        Ok(self.update(db).await?)
    }

    /// # Errors
    /// Galat database.
    pub async fn revoke(mut self, db: &DatabaseConnection) -> ModelResult<Model> {
        self.revoked_at = ActiveValue::set(Some(Utc::now().fixed_offset()));
        Ok(self.update(db).await?)
    }
}

#[cfg(test)]
mod tests {
    use super::hash_token;

    #[test]
    fn hash_is_stable_hex() {
        let h = hash_token("abc");
        assert_eq!(h.len(), 64);
        assert_eq!(h, hash_token("abc"));
        assert_ne!(h, hash_token("abd"));
    }
}
