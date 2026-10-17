use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Identity & access: tenants, users, server-side sessions.
///
/// Keputusan keamanan (ISO/IEC 27001:2022 A.5.15, A.5.17, A.8.5):
/// * password hanya disimpan sebagai hash Argon2id,
/// * sesi disimpan di server dan hanya hash token yang tersimpan,
/// * role dibatasi dengan CHECK constraint, bukan hanya validasi aplikasi.
const UP: &str = r"
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE tenants (
    id                  BIGSERIAL PRIMARY KEY,
    pid                 UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    slug                VARCHAR(64)  NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
    nama_pt             VARCHAR(200) NOT NULL,
    kode_pt             VARCHAR(16)  NOT NULL,
    tahun_aktif         INTEGER      NOT NULL CHECK (tahun_aktif BETWEEN 2000 AND 2100),
    allow_kab_rekognisi BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id                    BIGSERIAL PRIMARY KEY,
    pid                   UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    tenant_id             BIGINT       NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    email                 VARCHAR(254) NOT NULL,
    password              TEXT         NOT NULL,
    name                  VARCHAR(120) NOT NULL,
    role                  VARCHAR(32)  NOT NULL CHECK (role IN (
        'SUPER_ADMIN','ADMIN_PT','ADMIN_KEMAHASISWAAN','ADMIN_PRODI',
        'MAHASISWA','DOSEN_PEMBINA','AUDITOR')),
    is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
    failed_login_attempts INTEGER      NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    last_login_at         TIMESTAMPTZ,
    password_changed_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    must_change_password  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE INDEX users_tenant_role_idx ON users (tenant_id, role);

CREATE TABLE sessions (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   CHAR(64)    NOT NULL UNIQUE,
    csrf_token   VARCHAR(64) NOT NULL,
    ip           VARCHAR(64),
    user_agent   VARCHAR(256),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_updated_at   BEFORE UPDATE ON users   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
";

const DOWN: &str = r"
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tenants;
DROP FUNCTION IF EXISTS set_updated_at();
";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection().execute_unprepared(UP).await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection().execute_unprepared(DOWN).await?;
        Ok(())
    }
}
