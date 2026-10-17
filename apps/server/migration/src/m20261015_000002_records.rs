use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Data kemahasiswaan. Setiap tabel membawa `tenant_id` (isolasi antar PT) dan
/// CHECK constraint untuk nilai enum SIMKATMAWA sehingga data tidak valid
/// ditolak di lapisan database.
const UP: &str = r"
CREATE TABLE records (
    id                   BIGSERIAL PRIMARY KEY,
    pid                  UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    tenant_id            BIGINT       NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    kind                 VARCHAR(24)  NOT NULL CHECK (kind IN ('PRESTASI_MANDIRI','SERTIFIKASI','REKOGNISI')),
    status               VARCHAR(24)  NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT','SUBMITTED_INTERNAL','NEED_REVISION','VERIFIED','QUEUED','SENDING','SENT','FAILED','CANCELLED')),
    nama                 VARCHAR(300) NOT NULL,
    level                VARCHAR(8)   NOT NULL CHECK (level IN ('KAB','PROV','NAS','INT')),
    penyelenggara        VARCHAR(300) NOT NULL,
    url_peserta          TEXT         NOT NULL,
    url_sertifikat       TEXT         NOT NULL,
    tgl_sertifikat       DATE         NOT NULL,
    url_foto_upp         TEXT,
    url_dokumen_undangan TEXT,
    keterangan           TEXT,
    mahasiswa            JSONB        NOT NULL DEFAULT '[]'::jsonb,
    dosen                JSONB        NOT NULL DEFAULT '[]'::jsonb,
    extra                JSONB        NOT NULL DEFAULT '{}'::jsonb,
    simkatmawa_id        VARCHAR(64),
    simkatmawa_kode_pt   VARCHAR(16),
    simkatmawa_tahun     VARCHAR(8),
    sent_at              TIMESTAMPTZ,
    last_error           VARCHAR(500),
    submission_attempts  INTEGER      NOT NULL DEFAULT 0,
    idempotency_key      UUID         NOT NULL DEFAULT gen_random_uuid(),
    revision_note        VARCHAR(500),
    version              INTEGER      NOT NULL DEFAULT 1,
    created_by           BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX records_list_idx ON records (tenant_id, kind, status, created_at DESC);
CREATE UNIQUE INDEX records_simkatmawa_uidx ON records (tenant_id, kind, simkatmawa_id) WHERE simkatmawa_id IS NOT NULL;

CREATE TABLE kejuaraan (
    id                    BIGSERIAL PRIMARY KEY,
    pid                   UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    tenant_id             BIGINT       NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    nama_ajang            VARCHAR(300) NOT NULL,
    jenis_penyelenggaraan VARCHAR(32)  NOT NULL CHECK (jenis_penyelenggaraan IN ('MANDIRI','MANDIRI_TERVERIFIKASI')),
    level                 VARCHAR(8)   NOT NULL CHECK (level IN ('KAB','PROV','NAS','INT')),
    kategori              VARCHAR(16)  NOT NULL CHECK (kategori IN ('RISNOV','RISNOVSSH','SENBUD','OLAHRAGA','MINAT')),
    bentuk                VARCHAR(8)   NOT NULL CHECK (bentuk IN ('LURING','DARING','HIBRID')),
    tempat                VARCHAR(300) NOT NULL,
    url_ajang             TEXT         NOT NULL,
    tahun                 INTEGER      NOT NULL CHECK (tahun BETWEEN 2000 AND 2100),
    laporan               JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_by            BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX kejuaraan_tenant_idx ON kejuaraan (tenant_id, tahun DESC);

CREATE TABLE institusi_reports (
    id                          BIGSERIAL PRIMARY KEY,
    pid                         UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    tenant_id                   BIGINT      NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    tahun                       INTEGER     NOT NULL CHECK (tahun BETWEEN 2000 AND 2100),
    indikator                   JSONB       NOT NULL DEFAULT '[]'::jsonb,
    jumlah_penerima_beasiswa_non_apbn INTEGER NOT NULL DEFAULT 0 CHECK (jumlah_penerima_beasiswa_non_apbn >= 0),
    level_kelembagaan           SMALLINT    CHECK (level_kelembagaan IN (1,2,3)),
    total_anggaran_pt           BIGINT      NOT NULL DEFAULT 0 CHECK (total_anggaran_pt >= 0),
    total_anggaran_kemahasiswaan BIGINT     NOT NULL DEFAULT 0 CHECK (total_anggaran_kemahasiswaan >= 0),
    status                      VARCHAR(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED')),
    updated_by                  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, tahun)
);

CREATE TABLE enum_mappings (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT       NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_name      VARCHAR(32)  NOT NULL,
    internal_value  VARCHAR(64)  NOT NULL,
    simkatmawa_code VARCHAR(64)  NOT NULL,
    label           VARCHAR(120) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, group_name, internal_value)
);

CREATE TABLE documents (
    id                BIGSERIAL PRIMARY KEY,
    pid               UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    tenant_id         BIGINT       NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    record_type       VARCHAR(32)  NOT NULL,
    record_ref        VARCHAR(64)  NOT NULL,
    document_type     VARCHAR(32)  NOT NULL,
    tahun             INTEGER      NOT NULL,
    original_filename VARCHAR(200) NOT NULL,
    storage_key       VARCHAR(512) NOT NULL UNIQUE,
    public_url        TEXT         NOT NULL,
    mime_type         VARCHAR(64)  NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
    size_bytes        BIGINT       NOT NULL CHECK (size_bytes > 0),
    checksum_sha256   CHAR(64)     NOT NULL,
    is_locked         BOOLEAN      NOT NULL DEFAULT FALSE,
    uploaded_by       BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX documents_tenant_idx ON documents (tenant_id, created_at DESC);
CREATE INDEX documents_record_idx ON documents (tenant_id, record_type, record_ref);

CREATE TRIGGER records_updated_at           BEFORE UPDATE ON records           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER kejuaraan_updated_at         BEFORE UPDATE ON kejuaraan         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER institusi_reports_updated_at BEFORE UPDATE ON institusi_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER enum_mappings_updated_at     BEFORE UPDATE ON enum_mappings     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER documents_updated_at         BEFORE UPDATE ON documents         FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Dokumen terkunci (sudah dikirim ke SIMKATMAWA) tidak boleh dihapus walau lewat SQL langsung.
CREATE OR REPLACE FUNCTION documents_block_locked_delete() RETURNS trigger AS $$
BEGIN
    IF OLD.is_locked THEN
        RAISE EXCEPTION 'dokumen terkunci tidak boleh dihapus';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER documents_locked_delete BEFORE DELETE ON documents FOR EACH ROW EXECUTE FUNCTION documents_block_locked_delete();
";

const DOWN: &str = r"
DROP TABLE IF EXISTS documents;
DROP FUNCTION IF EXISTS documents_block_locked_delete();
DROP TABLE IF EXISTS enum_mappings;
DROP TABLE IF EXISTS institusi_reports;
DROP TABLE IF EXISTS kejuaraan;
DROP TABLE IF EXISTS records;
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
