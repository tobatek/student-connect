use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Integrasi SIMKATMAWA, log pengiriman, dan audit log tamper-evident.
///
/// ISO/IEC 27001:2022 A.8.15 (logging) dan A.8.16 (monitoring): `audit_logs`
/// bersifat append-only (trigger menolak UPDATE/DELETE/TRUNCATE) dan setiap
/// baris membawa hash berantai (`prev_hash` -> `hash`) sehingga perubahan
/// diam-diam dapat dideteksi.
const UP: &str = r"
CREATE TABLE simkatmawa_credentials (
    id               BIGSERIAL PRIMARY KEY,
    tenant_id        BIGINT       NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    api_url          VARCHAR(300) NOT NULL,
    email            VARCHAR(254) NOT NULL,
    enc_password     TEXT         NOT NULL,
    enc_token        TEXT,
    token_expires_at TIMESTAMPTZ,
    is_connected     BOOLEAN      NOT NULL DEFAULT FALSE,
    last_checked_at  TIMESTAMPTZ,
    last_error       VARCHAR(300),
    key_version      INTEGER      NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE submission_logs (
    id               BIGSERIAL PRIMARY KEY,
    pid              UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    tenant_id        BIGINT      NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    record_id        BIGINT      NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    kind             VARCHAR(24) NOT NULL,
    attempt          INTEGER     NOT NULL,
    outcome          VARCHAR(16) NOT NULL CHECK (outcome IN ('SUCCESS','FAILED','RETRY')),
    http_status      INTEGER,
    request_summary  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    response_summary JSONB       NOT NULL DEFAULT '{}'::jsonb,
    error            VARCHAR(500),
    idempotency_key  UUID        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX submission_logs_idx ON submission_logs (tenant_id, created_at DESC);
CREATE INDEX submission_logs_record_idx ON submission_logs (record_id);

CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   BIGINT,
    actor_id    BIGINT,
    actor_email VARCHAR(254),
    actor_role  VARCHAR(32),
    action      VARCHAR(64)  NOT NULL,
    entity      VARCHAR(64)  NOT NULL,
    entity_ref  VARCHAR(64),
    outcome     VARCHAR(16)  NOT NULL CHECK (outcome IN ('SUCCESS','DENIED','FAILURE')),
    ip          VARCHAR(64),
    request_id  VARCHAR(64),
    detail      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    prev_hash   CHAR(64)     NOT NULL,
    hash        CHAR(64)     NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_tenant_idx ON audit_logs (tenant_id, id DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, id DESC);

CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs bersifat append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();

CREATE TRIGGER simkatmawa_credentials_updated_at BEFORE UPDATE ON simkatmawa_credentials FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER submission_logs_updated_at        BEFORE UPDATE ON submission_logs        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
";

const DOWN: &str = r"
DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
DROP TABLE IF EXISTS audit_logs;
DROP FUNCTION IF EXISTS audit_logs_append_only();
DROP TABLE IF EXISTS submission_logs;
DROP TABLE IF EXISTS simkatmawa_credentials;
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
