use std::sync::OnceLock;

use chrono::{Duration, Utc};
use loco_rs::{hash, prelude::*};
use sea_orm::sea_query::{Expr, ExprTrait, Func};
use validator::ValidateEmail;

pub use super::_entities::users::{self, ActiveModel, Column, Entity, Model};
use crate::{errors::FieldErrors, security::{password, roles::Role}};

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

/// Parameter pembuatan pengguna (tidak ada pendaftaran mandiri: akun dibuat admin).
pub struct NewUser {
    pub tenant_id: i64,
    pub email: String,
    pub name: String,
    pub role: String,
    pub password: String,
}

impl NewUser {
    /// Normalisasi dan validasi. Mengembalikan galat per-field.
    ///
    /// # Errors
    /// Daftar galat field.
    pub fn validate(&mut self) -> std::result::Result<(), FieldErrors> {
        let mut errors = FieldErrors::default();
        self.email = self.email.trim().to_lowercase();
        self.name = self.name.trim().to_string();
        if !self.email.validate_email() || self.email.len() > 254 {
            errors.add("email", "Email tidak valid.");
        }
        if self.name.chars().count() < 2 || self.name.chars().count() > 120 {
            errors.add("name", "Nama 2-120 karakter.");
        }
        if Role::parse(&self.role).is_none() {
            errors.add("role", "Peran tidak dikenal.");
        }
        if let Err(msg) = password::validate(&self.password, &self.email) {
            errors.add("password", msg);
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}

/// Akun yang dibuat otomatis dari identitas Portal pada login SSO pertama.
pub struct NewSsoUser {
    pub tenant_id: i64,
    pub portal_user_id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub nim: Option<String>,
}

static DUMMY_HASH: OnceLock<String> = OnceLock::new();

impl Model {
    /// # Errors
    /// `EntityNotFound` bila tidak ada.
    pub async fn find_by_email(db: &DatabaseConnection, email: &str) -> ModelResult<Self> {
        let email = email.trim().to_lowercase();
        Entity::find()
            .filter(Expr::expr(Func::lower(Expr::col(Column::Email))).eq(email))
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)
    }

    /// # Errors
    /// `EntityNotFound` bila tidak ada.
    pub async fn find_by_id(db: &DatabaseConnection, id: i64) -> ModelResult<Self> {
        Entity::find_by_id(id)
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)
    }

    /// Pencarian dibatasi tenant (cegah IDOR).
    ///
    /// # Errors
    /// `EntityNotFound` bila tidak ada di tenant tersebut.
    pub async fn find_in_tenant(
        db: &DatabaseConnection,
        tenant_id: i64,
        pid: Uuid,
    ) -> ModelResult<Self> {
        Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .filter(Column::Pid.eq(pid))
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)
    }

    /// # Errors
    /// Galat database.
    pub async fn list_in_tenant(db: &DatabaseConnection, tenant_id: i64) -> ModelResult<Vec<Self>> {
        Ok(Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .order_by_asc(Column::Name)
            .all(db)
            .await?)
    }

    /// # Errors
    /// `EntityAlreadyExists` bila email sudah dipakai.
    pub async fn create(db: &DatabaseConnection, new: &NewUser) -> ModelResult<Self> {
        // Indeks unik `lower(email)` adalah pengaman akhir terhadap balapan.
        if Self::find_by_email(db, &new.email).await.is_ok() {
            return Err(ModelError::EntityAlreadyExists);
        }
        let password_hash =
            hash::hash_password(&new.password).map_err(|e| ModelError::Any(e.into()))?;
        let user = ActiveModel {
            tenant_id: ActiveValue::set(new.tenant_id),
            email: ActiveValue::set(new.email.clone()),
            name: ActiveValue::set(new.name.clone()),
            role: ActiveValue::set(new.role.clone()),
            password: ActiveValue::set(password_hash),
            pid: ActiveValue::set(Uuid::new_v4()),
            is_active: ActiveValue::set(true),
            failed_login_attempts: ActiveValue::set(0),
            must_change_password: ActiveValue::set(true),
            password_changed_at: ActiveValue::set(Utc::now().fixed_offset()),
            ..Default::default()
        }
        .insert(db)
        .await?;
        Ok(user)
    }

    /// # Errors
    /// `EntityNotFound` bila belum ada akun yang tertaut ke identitas Portal tersebut.
    pub async fn find_by_portal_id(db: &DatabaseConnection, portal_user_id: Uuid) -> ModelResult<Self> {
        Entity::find()
            .filter(Column::PortalUserId.eq(portal_user_id))
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)
    }

    /// Membuat akun hasil provisioning SSO. Kata sandinya acak dan tak pernah ditampilkan,
    /// sehingga akun ini hanya bisa masuk lewat Portal.
    ///
    /// # Errors
    /// `EntityAlreadyExists` bila email atau identitas Portal sudah terpakai (balapan).
    pub async fn create_sso(db: &DatabaseConnection, new: &NewSsoUser) -> ModelResult<Self> {
        let unusable = hash::hash_password(&hash::random_string(48)).map_err(|e| ModelError::Any(e.into()))?;
        let inserted = ActiveModel {
            tenant_id: ActiveValue::set(new.tenant_id),
            email: ActiveValue::set(new.email.clone()),
            name: ActiveValue::set(new.name.clone()),
            role: ActiveValue::set(new.role.clone()),
            password: ActiveValue::set(unusable),
            pid: ActiveValue::set(Uuid::new_v4()),
            is_active: ActiveValue::set(true),
            failed_login_attempts: ActiveValue::set(0),
            must_change_password: ActiveValue::set(false),
            password_changed_at: ActiveValue::set(Utc::now().fixed_offset()),
            portal_user_id: ActiveValue::set(Some(new.portal_user_id)),
            nim: ActiveValue::set(new.nim.clone()),
            auth_source: ActiveValue::set("sso".to_string()),
            ..Default::default()
        }
        .insert(db)
        .await;
        match inserted {
            Ok(user) => Ok(user),
            Err(e) if matches!(e.sql_err(), Some(sea_orm::SqlErr::UniqueConstraintViolation(_))) => {
                Err(ModelError::EntityAlreadyExists)
            }
            Err(e) => Err(e.into()),
        }
    }

    #[must_use]
    pub fn verify_password(&self, candidate: &str) -> bool {
        hash::verify_password(candidate, &self.password)
    }

    /// Menyamakan waktu respons saat email tidak ditemukan (anti user-enumeration).
    pub fn burn_password_check(candidate: &str) {
        let dummy = DUMMY_HASH.get_or_init(|| {
            hash::hash_password("dummy-password-for-timing").unwrap_or_default()
        });
        let _ = hash::verify_password(candidate, dummy);
    }

    #[must_use]
    pub fn is_locked(&self) -> bool {
        self.locked_until.is_some_and(|until| until > Utc::now())
    }

    #[must_use]
    pub fn role_enum(&self) -> Option<Role> {
        Role::parse(&self.role)
    }
}

impl ActiveModel {
    /// Menyimpan NIM dari Portal agar formulir mahasiswa terisi otomatis.
    ///
    /// # Errors
    /// Galat database.
    pub async fn set_nim(mut self, db: &DatabaseConnection, nim: &str) -> ModelResult<Model> {
        self.nim = ActiveValue::set(Some(nim.to_string()));
        Ok(self.update(db).await?)
    }

    /// Mengikat akun lokal yang sudah ada ke identitas Portal (login SSO pertama).
    ///
    /// # Errors
    /// Galat database (termasuk pelanggaran keunikan `portal_user_id`).
    pub async fn link_portal(mut self, db: &DatabaseConnection, portal_user_id: Uuid) -> ModelResult<Model> {
        self.portal_user_id = ActiveValue::set(Some(portal_user_id));
        Ok(self.update(db).await?)
    }

    /// Mencatat kegagalan login; mengunci akun setelah `max` percobaan (A.8.5).
    ///
    /// # Errors
    /// Galat database.
    pub async fn failed_login(
        mut self,
        db: &DatabaseConnection,
        current_attempts: i32,
        max: i32,
        lockout_minutes: i64,
    ) -> ModelResult<Model> {
        let attempts = current_attempts + 1;
        self.failed_login_attempts = ActiveValue::set(attempts);
        if attempts >= max {
            self.locked_until =
                ActiveValue::set(Some((Utc::now() + Duration::minutes(lockout_minutes)).fixed_offset()));
            self.failed_login_attempts = ActiveValue::set(0);
        }
        Ok(self.update(db).await?)
    }

    /// # Errors
    /// Galat database.
    pub async fn login_succeeded(mut self, db: &DatabaseConnection) -> ModelResult<Model> {
        self.failed_login_attempts = ActiveValue::set(0);
        self.locked_until = ActiveValue::set(None);
        self.last_login_at = ActiveValue::set(Some(Utc::now().fixed_offset()));
        Ok(self.update(db).await?)
    }

    /// # Errors
    /// Galat hashing atau database.
    pub async fn set_password(
        mut self,
        db: &DatabaseConnection,
        new_password: &str,
        must_change: bool,
    ) -> ModelResult<Model> {
        self.password = ActiveValue::set(
            hash::hash_password(new_password).map_err(|e| ModelError::Any(e.into()))?,
        );
        self.password_changed_at = ActiveValue::set(Utc::now().fixed_offset());
        self.must_change_password = ActiveValue::set(must_change);
        self.failed_login_attempts = ActiveValue::set(0);
        self.locked_until = ActiveValue::set(None);
        Ok(self.update(db).await?)
    }
}
