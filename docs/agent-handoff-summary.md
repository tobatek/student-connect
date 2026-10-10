# Agent Handoff Summary

Tanggal: 2026-10-09  
Repo: `C:\Users\SEVIMA-337\Documents\Students_Connect`  
Plan utama: `docs/monorepo-loco-backend-plan.md`

## Prinsip Lanjut

Lanjutkan fase secara berurutan dan jangan melebar di luar plan.

- Fase 1: restrukturisasi monorepo.
- Fase 2: backend foundation.
- Fase 3: data model dan CRUD inti.
- Fase 4: R2 document service.
- Fase 5 berikutnya: SIMKATMAWA credential dan test connection.

Jangan lanjut Fase 5 sebelum catatan Fase 4 tentang object key acak diselesaikan.

## Status Fase

### Fase 1 - Restrukturisasi Monorepo

Status: selesai baseline.

Yang sudah dibuat:

- Frontend dipindah ke `apps/web`.
- Backend scaffold dibuat di `apps/api`.
- Root workspace dibuat:
  - `package.json`
  - `pnpm-workspace.yaml`
  - `tsconfig.base.json`
- `packages/api-client/generated/README.md` dibuat sebagai tempat generated API client.
- `.env.example` diperbarui dengan env frontend, backend, SIMKATMAWA, dan R2.

Verifikasi:

- `pnpm install` berhasil.
- `pnpm --filter @students-connect/web lint` berhasil.
- `pnpm --filter @students-connect/web build` berhasil.

### Fase 2 - Backend Foundation

Status: selesai baseline.

Yang sudah dibuat:

- `apps/api/src/config.rs`: membaca config dari environment.
- `apps/api/src/database.rs`: deteksi engine database PostgreSQL/SQLite.
- `apps/api/src/http.rs`: parser HTTP sederhana, response JSON, query param.
- `apps/api/src/middleware/rbac.rs`: auth context dan RBAC role:
  - `SUPER_ADMIN`
  - `ADMIN_PT`
  - `ADMIN_KEMAHASISWAAN`
  - `ADMIN_PRODI`
  - `MAHASISWA`
  - `DOSEN_PEMBINA`
  - `AUDITOR`
- `apps/api/src/services/audit_log.rs`: audit log stdout dengan masking field sensitif.
- `apps/api/migration/202610090001_backend_foundation.sql`: tabel `tenants`, `users`, `sessions`, `audit_logs`.
- Endpoint:
  - `GET /api/health`
  - `GET /api/session`
  - `GET /api/tenant`
  - `PUT /api/tenant`

Auth sementara memakai header:

```text
x-user-id
x-tenant-id
x-user-role
```

Catatan: ini baseline sementara sebelum session/token final.

### Fase 3 - Data Model dan CRUD Inti

Status: selesai baseline in-memory + migration.

Yang sudah dibuat:

- `apps/api/src/state.rs`: state in-memory untuk tenant, records, documents.
- `apps/api/src/models/record.rs`: model generic record dan `RecordKind`.
- `apps/api/src/services/crud.rs`: list/get/create/update generic.
- `apps/api/src/validators/records.rs`: validasi field wajib awal.
- `apps/api/migration/202610090002_core_crud.sql`: tabel:
  - `prestasi_mandiri`
  - `sertifikasi`
  - `rekognisi`
  - `kejuaraan`
  - `institusi`
  - `enum_mappings`

Endpoint baseline:

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

Catatan:

- Data masih in-memory untuk baseline lokal.
- Migration sudah disiapkan untuk PostgreSQL.
- Integrasi ORM/DB nyata belum dikerjakan.

### Fase 4 - R2 Document Service

Status: baseline selesai, tetapi ada blocker security sebelum lanjut Fase 5.

Yang sudah dibuat:

- `apps/api/src/models/document.rs`: metadata dokumen aman.
- `apps/api/src/controllers/documents.rs`: endpoint dokumen.
- `apps/api/src/services/r2_storage.rs`: builder object key dan public URL.
- `apps/api/src/validators/upload.rs`: validasi metadata upload.
- `apps/api/migration/202610090003_documents.sql`: tabel `documents`.

Endpoint baseline:

```text
GET    /api/documents?page=1&limit=20
POST   /api/documents/upload
GET    /api/documents/:id
DELETE /api/documents/:id
```

Payload upload baseline:

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

Validasi yang sudah ada:

- MIME allowlist: PDF, JPG, JPEG, PNG.
- Ukuran file memakai `R2_MAX_UPLOAD_MB`.
- Filename menolak `../`, slash, backslash, null byte, dan control char.
- Delete menolak dokumen `is_locked=true`.
- Public URL dibuat dari `R2_PUBLIC_BASE_URL`.

Blocker sebelum lanjut Fase 5:

- Object key saat ini memakai komponen unik berbasis waktu/counter di `apps/api/src/services/r2_storage.rs`.
- Plan meminta object key wajib memakai UUID/random component yang sulit ditebak.
- Sebelum lanjut Fase 5, ganti generator ini ke UUID/CSPRNG proper.
- Di Windows lokal, dependency `uuid` gagal pada target GNU karena `dlltool.exe` tidak tersedia. Pilihan lanjut:
  - Pasang MinGW lengkap sehingga `dlltool.exe` tersedia.
  - Pasang Visual Studio Build Tools C++ sehingga target MSVC punya `link.exe`.
  - Gunakan crate random yang bisa berjalan pada toolchain saat ini, lalu verifikasi dengan `cargo test`.

## Review Fase 1-3 (2026-10-10)

Perbaikan yang sudah diterapkan:

- Fase 1: `target/` di-ignore, dependency dan config sisa AI Studio dihapus, README ditambahkan, restrukturisasi monorepo dicommit.
- Fase 3: semua akses record/dokumen/tenant di-scope `tenant_id` (IDOR ditutup); field tulis di-allowlist per entitas (`status`, `created_by`, `tenant_id`, `is_locked` hanya server); validasi enum/panjang/URL/tanggal; `PUT /api/settings/enum-mappings` menjadi upsert khusus `SUPER_ADMIN`/`ADMIN_PT`; record `QUEUED/SENDING/SENT` tidak bisa diedit (409); audit create/update memakai nama entitas tanpa menyalin body.
- Fase 4 (celah ikut tertutup): `record_type`/`record_id`/`document_type`/`tahun` divalidasi allowlist sebelum masuk object key.
- Fase 2: CORS allowlist + preflight, security headers, batas header 16 KiB dan body 1 MiB (431/413), thread per koneksi (maks 64, selebihnya 503), deadline baca request, `Transfer-Encoding` ditolak, query di-percent-decode, `escape_json` lengkap, error 500 tidak membocorkan detail, `AuthError` bertipe (401/403).
- Server menolak start di `APP_ENV=production` bila secret default/pendek, CORS `*`, URL bukan https, atau auth masih berbasis header.

Belum dikerjakan (butuh keputusan/arsitektur):

- Koneksi database nyata + migration runner (data masih in-memory; SQL memakai `tenant_id UUID`, kode memakai string).
- Login, session/token dengan expiry, hash password (Argon2id), audit log ke tabel `audit_logs`.
- Kepemilikan data per peran (MAHASISWA/DOSEN_PEMBINA saat ini membaca semua record tenant-nya).
- Keputusan Loco.rs/Axum vs server TCP buatan sendiri.

## Toolchain dan Perintah Verifikasi

Rust MSVC sempat gagal karena `link.exe` tidak ada.

Gunakan target GNU untuk verifikasi lokal:

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo +stable-x86_64-pc-windows-gnu test --manifest-path apps/api/Cargo.toml
cargo +stable-x86_64-pc-windows-gnu fmt --manifest-path apps/api/Cargo.toml --check
cargo +stable-x86_64-pc-windows-gnu check --manifest-path apps/api/Cargo.toml --tests
```

Frontend:

```powershell
pnpm --filter @students-connect/web lint
pnpm --filter @students-connect/web build
```

Hasil terakhir:

- Backend test: `43 passed`, clippy bersih.
- Backend fmt check: berhasil.
- Frontend lint: berhasil.
- Frontend build: berhasil.

## Smoke Test yang Pernah Berhasil

Jalankan server:

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:API_BIND_ADDRESS="127.0.0.1:5150"
cargo +stable-x86_64-pc-windows-gnu run --manifest-path apps/api/Cargo.toml
```

Hasil yang pernah dicek:

- `GET /api/health` -> `200`.
- `GET /api/session` dengan role `AUDITOR` -> `200`.
- `GET /api/tenant` tanpa auth -> `401`.
- Raw HTTP `POST /api/prestasi-mandiri` -> `201`.
- `GET /api/prestasi-mandiri?page=1&limit=10` -> `200`.
- Raw HTTP `POST /api/documents/upload` -> `201` dan menghasilkan `public_url`.

Catatan smoke test:

- `Invoke-WebRequest` dan `curl.exe` di PowerShell sempat membuat body JSON tidak terbaca sesuai harapan karena quoting/encoding.
- Raw TCP client PowerShell berhasil. Parser server juga sudah diperbaiki agar membaca body berdasarkan `Content-Length`.

## File Penting

Backend:

- `apps/api/src/main.rs`
- `apps/api/src/app.rs`
- `apps/api/src/config.rs`
- `apps/api/src/database.rs`
- `apps/api/src/http.rs`
- `apps/api/src/state.rs`
- `apps/api/src/middleware/rbac.rs`
- `apps/api/src/services/audit_log.rs`
- `apps/api/src/services/crud.rs`
- `apps/api/src/services/r2_storage.rs`
- `apps/api/src/controllers/documents.rs`
- `apps/api/src/validators/records.rs`
- `apps/api/src/validators/upload.rs`

Migrations:

- `apps/api/migration/202610090001_backend_foundation.sql`
- `apps/api/migration/202610090002_core_crud.sql`
- `apps/api/migration/202610090003_documents.sql`

Docs:

- `docs/monorepo-loco-backend-plan.md`
- `docs/backend-foundation.md`
- `docs/agent-handoff-summary.md`

## Jangan Dilupakan

- Jangan menaruh secret di frontend, log, response, atau repository.
- Jangan percaya role dari frontend untuk production final; header auth saat ini hanya baseline sementara.
- Fase 3 masih in-memory. Untuk production, sambungkan ke PostgreSQL/ORM sesuai plan sebelum menganggap data tidak lagi bergantung localStorage secara penuh.
- Fase 4 belum benar-benar upload byte ke R2. Saat ini endpoint menerima metadata upload dan membentuk key/public URL. Implementasi S3/R2 client nyata harus tetap berada di backend.
- Jangan lanjut ke frontend API migration sebelum backend contracts cukup stabil sesuai Fase 7.
