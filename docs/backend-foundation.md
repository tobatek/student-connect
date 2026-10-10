# Backend Foundation

Status: Fase 2 baseline.

## Runtime Config

Backend membaca konfigurasi dari environment. Contoh nilai ada di `.env.example`.

Variabel utama:

- `API_BIND_ADDRESS`
- `DATABASE_URL`
- `APP_ENV`
- `APP_PUBLIC_URL`
- `CORS_ALLOWED_ORIGINS`
- `SESSION_SECRET`
- `CREDENTIAL_MASTER_KEY`
- `SIMKATMAWA_DEFAULT_API_URL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_PUBLIC_BASE_URL`
- `R2_REGION`
- `R2_MAX_UPLOAD_MB`

Secret hanya boleh berada di backend environment atau secret manager.

## Endpoint Baseline

```text
GET /api/health
```

Public health check. Respons memuat status service dan environment.

```text
GET /api/tenant
PUT /api/tenant
```

Endpoint ini sudah dilindungi RBAC baseline dan menerima role:

- `SUPER_ADMIN`
- `ADMIN_PT`

Persistensi tenant penuh dikerjakan pada Fase 3.

```text
GET /api/session
```

Endpoint session baseline untuk membaca auth context backend. Endpoint ini menerima semua role yang dikenal dan tidak mengambil keputusan authorization bisnis.

## Fase 3 CRUD Inti

Endpoint CRUD awal:

```text
GET  /api/prestasi-mandiri?page=1&limit=20
POST /api/prestasi-mandiri
GET  /api/prestasi-mandiri/:id
PUT  /api/prestasi-mandiri/:id

GET  /api/sertifikasi?page=1&limit=20
POST /api/sertifikasi
GET  /api/sertifikasi/:id
PUT  /api/sertifikasi/:id

GET  /api/rekognisi?page=1&limit=20
POST /api/rekognisi
GET  /api/rekognisi/:id
PUT  /api/rekognisi/:id

GET  /api/kejuaraan?page=1&limit=20
POST /api/kejuaraan
GET  /api/kejuaraan/:id
PUT  /api/kejuaraan/:id

GET  /api/institusi?page=1&limit=20
POST /api/institusi
GET  /api/institusi/:id
PUT  /api/institusi/:id

GET /api/settings/enum-mappings?page=1&limit=20
PUT /api/settings/enum-mappings
```

Semua endpoint list/detail membutuhkan auth context. Create/update dibatasi untuk role admin. Validasi backend aktif untuk field wajib awal dan semua list memakai pagination dengan `limit` maksimum 100.

## Fase 4 Document Service

Endpoint dokumen awal:

```text
GET    /api/documents?page=1&limit=20
POST   /api/documents/upload
GET    /api/documents/:id
DELETE /api/documents/:id
```

Upload saat ini menerima metadata JSON dari backend boundary:

```json
{
  "original_filename": "sertifikat.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 12345,
  "checksum": "sha256...",
  "record_type": "prestasi-mandiri",
  "record_id": "pm-1",
  "document_type": "sertifikat",
  "tahun": "2026"
}
```

Backend membuat `object_key` acak memakai UUID, membentuk `public_url` dari `R2_PUBLIC_BASE_URL`, membatasi MIME ke PDF/JPG/JPEG/PNG, membatasi ukuran dari `R2_MAX_UPLOAD_MB`, dan menolak filename tidak aman. Delete akan ditolak untuk dokumen yang sudah `is_locked=true`.

## Auth Baseline

Sementara sebelum session/token final, middleware membaca context dari header backend:

```text
x-user-id
x-tenant-id
x-user-role
```

Role yang dikenal:

- `SUPER_ADMIN`
- `ADMIN_PT`
- `ADMIN_KEMAHASISWAAN`
- `ADMIN_PRODI`
- `MAHASISWA`
- `DOSEN_PEMBINA`
- `AUDITOR`

## Audit Log Baseline

Audit service mencatat aksi penting dengan masking field sensitif seperti:

- `password`
- `token`
- `access_token`
- `secret`
- `secret_access_key`
- `credential_master_key`

Persistensi audit log ke database mengikuti migration awal `apps/api/migration/202610090001_backend_foundation.sql`.
