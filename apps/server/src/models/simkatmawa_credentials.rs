//! Kredensial SIMKATMAWA per tenant. Password dan token selalu terenkripsi (AES-256-GCM, AAD
//! terikat tenant) dan TIDAK PERNAH dikembalikan ke klien.

use chrono::{DateTime, Utc};
use loco_rs::prelude::*;

pub use super::_entities::simkatmawa_credentials::{self, ActiveModel, Column, Entity, Model};
use crate::security::vault::{Vault, VaultError};

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

#[must_use]
pub fn aad(tenant_id: i64, field: &str) -> String {
    format!("tenant:{tenant_id}:{field}")
}

impl Model {
    /// # Errors
    /// Galat database.
    pub async fn find_for_tenant(db: &DatabaseConnection, tenant_id: i64) -> ModelResult<Option<Self>> {
        Ok(Entity::find().filter(Column::TenantId.eq(tenant_id)).one(db).await?)
    }

    /// Simpan/ganti kredensial. Token lama dibuang (kredensial berubah).
    ///
    /// # Errors
    /// Galat enkripsi atau database.
    pub async fn save(
        db: &DatabaseConnection,
        vault: &Vault,
        tenant_id: i64,
        api_url: &str,
        email: &str,
        password: &str,
    ) -> ModelResult<Self> {
        let enc_password = vault
            .seal(password, &aad(tenant_id, "password"))
            .map_err(|e| ModelError::Any(Box::new(std::io::Error::other(e.to_string()))))?;
        match Self::find_for_tenant(db, tenant_id).await? {
            Some(existing) => {
                let mut am = existing.into_active_model();
                am.api_url = ActiveValue::set(api_url.to_string());
                am.email = ActiveValue::set(email.to_string());
                am.enc_password = ActiveValue::set(enc_password);
                am.enc_token = ActiveValue::set(None);
                am.token_expires_at = ActiveValue::set(None);
                am.is_connected = ActiveValue::set(false);
                am.last_error = ActiveValue::set(None);
                Ok(am.update(db).await?)
            }
            None => Ok(ActiveModel {
                tenant_id: ActiveValue::set(tenant_id),
                api_url: ActiveValue::set(api_url.to_string()),
                email: ActiveValue::set(email.to_string()),
                enc_password: ActiveValue::set(enc_password),
                is_connected: ActiveValue::set(false),
                key_version: ActiveValue::set(1),
                ..Default::default()
            }
            .insert(db)
            .await?),
        }
    }

    /// # Errors
    /// `BadCiphertext` bila data rusak atau dipindah antar tenant.
    pub fn password(&self, vault: &Vault) -> Result<String, VaultError> {
        vault.open(&self.enc_password, &aad(self.tenant_id, "password"))
    }

    /// Token yang masih berlaku (sisa umur > 60 detik), atau `None`.
    #[must_use]
    pub fn valid_token(&self, vault: &Vault) -> Option<String> {
        let exp = self.token_expires_at?;
        if exp.with_timezone(&Utc) <= Utc::now() + chrono::Duration::seconds(60) {
            return None;
        }
        vault.open(self.enc_token.as_deref()?, &aad(self.tenant_id, "token")).ok()
    }
}

impl ActiveModel {
    /// # Errors
    /// Galat enkripsi atau database.
    pub async fn store_token(
        mut self,
        db: &DatabaseConnection,
        vault: &Vault,
        tenant_id: i64,
        token: &str,
        expires_at: DateTime<Utc>,
    ) -> ModelResult<Model> {
        let sealed = vault
            .seal(token, &aad(tenant_id, "token"))
            .map_err(|e| ModelError::Any(Box::new(std::io::Error::other(e.to_string()))))?;
        self.enc_token = ActiveValue::set(Some(sealed));
        self.token_expires_at = ActiveValue::set(Some(expires_at.fixed_offset()));
        self.is_connected = ActiveValue::set(true);
        self.last_checked_at = ActiveValue::set(Some(Utc::now().fixed_offset()));
        self.last_error = ActiveValue::set(None);
        Ok(self.update(db).await?)
    }

    /// # Errors
    /// Galat database.
    pub async fn record_failure(mut self, db: &DatabaseConnection, message: &str) -> ModelResult<Model> {
        self.is_connected = ActiveValue::set(false);
        self.last_checked_at = ActiveValue::set(Some(Utc::now().fixed_offset()));
        self.last_error = ActiveValue::set(Some(message.chars().take(300).collect()));
        Ok(self.update(db).await?)
    }
}
