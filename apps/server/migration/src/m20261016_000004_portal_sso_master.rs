use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Integrasi Portal: tautan akun SSO, cache data master (mahasiswa/pegawai) dan log sinkronisasi.
///
/// * `users.portal_user_id` mengikat akun lokal ke identitas Portal (unik bila terisi);
///   `users.nim` menyimpan NIM mahasiswa dari Portal untuk pengisian otomatis formulir.
/// * Tabel `master_*` adalah cache baca-saja dari Portal (sumber kebenaran ada di Portal).
///   Data sensitif (NIK, tanggal lahir, nama ibu) sengaja TIDAK disimpan di sini.
/// * Data yang hilang dari sumber hanya ditandai nonaktif, tidak pernah dihapus.
/// * `sync_runs` menyimpan hitungan hasil saja; tidak ada data pribadi di log.
const UP: &str = r"
ALTER TABLE users
    ADD COLUMN portal_user_id UUID,
    ADD COLUMN nim VARCHAR(32),
    ADD COLUMN auth_source VARCHAR(8) NOT NULL DEFAULT 'local' CHECK (auth_source IN ('local','sso'));
CREATE UNIQUE INDEX users_portal_user_id_key ON users (portal_user_id) WHERE portal_user_id IS NOT NULL;

CREATE TABLE master_students (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT       NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nim               VARCHAR(32)  NOT NULL,
    full_name         VARCHAR(200) NOT NULL,
    email             VARCHAR(254),
    study_program     VARCHAR(200),
    cohort_year       INTEGER CHECK (cohort_year IS NULL OR cohort_year BETWEEN 1950 AND 2100),
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    source_hash       CHAR(64)     NOT NULL,
    source_updated_at TIMESTAMPTZ,
    last_seen_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, nim)
);
CREATE INDEX master_students_email_idx ON master_students (tenant_id, lower(email));

CREATE TABLE master_employees (
    id                BIGSERIAL PRIMARY KEY,
    tenant_id         BIGINT       NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nip               VARCHAR(32)  NOT NULL,
    full_name         VARCHAR(200) NOT NULL,
    email             VARCHAR(254),
    work_unit         VARCHAR(200),
    position          VARCHAR(200),
    nuptk             VARCHAR(25),
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    source_hash       CHAR(64)     NOT NULL,
    source_updated_at TIMESTAMPTZ,
    last_seen_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, nip)
);
CREATE INDEX master_employees_email_idx ON master_employees (tenant_id, lower(email));
CREATE INDEX master_employees_nuptk_idx ON master_employees (tenant_id, nuptk) WHERE nuptk IS NOT NULL;

CREATE TABLE sync_runs (
    id           BIGSERIAL PRIMARY KEY,
    pid          UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    tenant_id    BIGINT      NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kind         VARCHAR(16) NOT NULL CHECK (kind IN ('students','employees')),
    triggered_by VARCHAR(16) NOT NULL CHECK (triggered_by IN ('schedule','manual','task')),
    status       VARCHAR(16) NOT NULL CHECK (status IN ('RUNNING','SUCCESS','PARTIAL','FAILED')),
    fetched      INTEGER     NOT NULL DEFAULT 0,
    created      INTEGER     NOT NULL DEFAULT 0,
    updated      INTEGER     NOT NULL DEFAULT 0,
    unchanged    INTEGER     NOT NULL DEFAULT 0,
    deactivated  INTEGER     NOT NULL DEFAULT 0,
    failed       INTEGER     NOT NULL DEFAULT 0,
    note         VARCHAR(300),
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Satu sinkronisasi berjalan per tenant+jenis (mencegah dua proses menimpa satu sama lain).
CREATE UNIQUE INDEX sync_runs_one_running_idx ON sync_runs (tenant_id, kind) WHERE status = 'RUNNING';
CREATE INDEX sync_runs_recent_idx ON sync_runs (tenant_id, started_at DESC);

CREATE TRIGGER master_students_updated_at  BEFORE UPDATE ON master_students  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER master_employees_updated_at BEFORE UPDATE ON master_employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sync_runs_updated_at        BEFORE UPDATE ON sync_runs        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
";

const DOWN: &str = r"
DROP TABLE IF EXISTS sync_runs;
DROP TABLE IF EXISTS master_employees;
DROP TABLE IF EXISTS master_students;
DROP INDEX IF EXISTS users_portal_user_id_key;
ALTER TABLE users DROP COLUMN IF EXISTS nim, DROP COLUMN IF EXISTS auth_source, DROP COLUMN IF EXISTS portal_user_id;
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
