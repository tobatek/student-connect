-- Fase 3 - Data Model dan CRUD Inti
-- Production target: PostgreSQL.

CREATE TABLE IF NOT EXISTS prestasi_mandiri (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    simkatmawa_id TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sertifikasi (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    simkatmawa_id TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rekognisi (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    simkatmawa_id TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kejuaraan (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS institusi (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enum_mappings (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    payload JSONB NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prestasi_mandiri_tenant_id ON prestasi_mandiri(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prestasi_mandiri_status ON prestasi_mandiri(status);
CREATE INDEX IF NOT EXISTS idx_prestasi_mandiri_created_at ON prestasi_mandiri(created_at);
CREATE INDEX IF NOT EXISTS idx_prestasi_mandiri_simkatmawa_id ON prestasi_mandiri(simkatmawa_id);

CREATE INDEX IF NOT EXISTS idx_sertifikasi_tenant_id ON sertifikasi(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sertifikasi_status ON sertifikasi(status);
CREATE INDEX IF NOT EXISTS idx_sertifikasi_created_at ON sertifikasi(created_at);
CREATE INDEX IF NOT EXISTS idx_sertifikasi_simkatmawa_id ON sertifikasi(simkatmawa_id);

CREATE INDEX IF NOT EXISTS idx_rekognisi_tenant_id ON rekognisi(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rekognisi_status ON rekognisi(status);
CREATE INDEX IF NOT EXISTS idx_rekognisi_created_at ON rekognisi(created_at);
CREATE INDEX IF NOT EXISTS idx_rekognisi_simkatmawa_id ON rekognisi(simkatmawa_id);

CREATE INDEX IF NOT EXISTS idx_kejuaraan_tenant_id ON kejuaraan(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kejuaraan_status ON kejuaraan(status);
CREATE INDEX IF NOT EXISTS idx_kejuaraan_created_at ON kejuaraan(created_at);

CREATE INDEX IF NOT EXISTS idx_institusi_tenant_id ON institusi(tenant_id);
CREATE INDEX IF NOT EXISTS idx_institusi_status ON institusi(status);
CREATE INDEX IF NOT EXISTS idx_institusi_created_at ON institusi(created_at);

CREATE INDEX IF NOT EXISTS idx_enum_mappings_tenant_id ON enum_mappings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enum_mappings_created_at ON enum_mappings(created_at);
