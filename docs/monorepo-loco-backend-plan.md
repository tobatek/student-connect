# Rencana Monorepo Student Connect + Backend Loco.rs

Status: draft kesepakatan teknis  
Tanggal: 2026-10-07  
Fokus utama: efisiensi server, keamanan, integrasi SIMKATMAWA, dan pengelolaan dokumen R2 publik permanen

## 1. Tujuan

Dokumen ini menjadi acuan migrasi Student Connect dari prototype frontend berbasis localStorage menjadi aplikasi production-ready dengan arsitektur monorepo:

- Frontend React + Vite untuk dashboard dan operasional pengguna.
- Backend Loco.rs/Rust sebagai API utama yang ringan, aman, dan efisien.
- Database untuk persistensi data resmi.
- Cloudflare R2/S3-compatible storage untuk dokumen bukti yang dapat dikirim sebagai link publik ke SIMKATMAWA.
- Kontrol keamanan mengikuti praktik ISO/IEC 27001:2022 secara operasional, dengan catatan sertifikasi ISO tetap membutuhkan audit organisasi formal.

Target akhir:

- Tidak ada credential sensitif di browser.
- Semua submit SIMKATMAWA dilakukan melalui backend.
- Semua dokumen R2 memiliki link publik permanen, sulit ditebak, tervalidasi, dan terkunci setelah digunakan.
- Semua input berisiko divalidasi, disanitasi, dan diaudit.
- Server tetap hemat CPU, RAM, dan dependency runtime.

## 2. Prinsip Arsitektur

### 2.1 Efisiensi

- Backend memakai Loco.rs/Rust agar dapat dideploy sebagai binary release yang ringan.
- Frontend dibuild menjadi static assets.
- Proses berat seperti submit SIMKATMAWA, retry, dan refresh token dipindahkan ke background job.
- API dibuat stateless sejauh mungkin.
- Query database wajib memakai index dan pagination.
- Upload dokumen dibatasi ukuran dan tipe file.
- Logging tidak boleh menyimpan payload besar atau rahasia.

### 2.2 Keamanan

- Secret hanya berada di backend environment dan secret manager.
- Password/token SIMKATMAWA dienkripsi di database.
- R2 access key tidak pernah dikirim ke frontend.
- Validasi dilakukan dua lapis: frontend untuk UX, backend untuk keamanan.
- Role-based access control wajib diterapkan di backend.
- Semua aksi penting memiliki audit log.
- Data export CSV/XLSX harus aman dari formula injection.
- Public document URL hanya untuk dokumen bukti, dengan object key acak dan tanpa directory listing.

### 2.3 Keterawatan

- Frontend, backend, dan kontrak API dipisahkan jelas.
- Backend menjadi source of truth.
- Frontend memakai generated API client dari OpenAPI jika memungkinkan.
- Modul SIMKATMAWA dan R2 dipisahkan sebagai service backend.

## 3. Struktur Monorepo Target

```text
Students_Connect/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  ├─ index.html
│  │  ├─ vite.config.ts
│  │  └─ package.json
│  │
│  └─ api/
│     ├─ src/
│     │  ├─ app.rs
│     │  ├─ main.rs
│     │  ├─ controllers/
│     │  ├─ models/
│     │  ├─ services/
│     │  ├─ jobs/
│     │  ├─ middleware/
│     │  └─ validators/
│     ├─ config/
│     ├─ migration/
│     └─ Cargo.toml
│
├─ packages/
│  └─ api-client/
│     └─ generated/
│
├─ docs/
│  ├─ monorepo-loco-backend-plan.md
│  └─ simkatmawa-api-panduan.md
│
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ .env.example
```

## 4. Backend Loco.rs

### 4.1 Modul Backend

```text
controllers/
- tenant.rs
- auth.rs
- users.rs
- prestasi_mandiri.rs
- sertifikasi.rs
- rekognisi.rs
- kejuaraan.rs
- institusi.rs
- documents.rs
- simkatmawa.rs
- submission_logs.rs
- settings.rs

services/
- simkatmawa_client.rs
- r2_storage.rs
- credential_vault.rs
- document_lock.rs
- csv_export.rs
- audit_log.rs
- rate_limit.rs

jobs/
- submit_simkatmawa.rs
- refresh_simkatmawa_token.rs
- cleanup_failed_uploads.rs
- document_integrity_check.rs
```

### 4.2 Endpoint Awal

```text
GET    /api/health

GET    /api/tenant
PUT    /api/tenant

GET    /api/simkatmawa/status
POST   /api/simkatmawa/credentials/test
PUT    /api/simkatmawa/credentials
POST   /api/simkatmawa/refresh-token

GET    /api/prestasi-mandiri
POST   /api/prestasi-mandiri
GET    /api/prestasi-mandiri/:id
PUT    /api/prestasi-mandiri/:id
POST   /api/prestasi-mandiri/:id/submit

GET    /api/sertifikasi
POST   /api/sertifikasi
PUT    /api/sertifikasi/:id
POST   /api/sertifikasi/:id/submit

GET    /api/rekognisi
POST   /api/rekognisi
PUT    /api/rekognisi/:id
POST   /api/rekognisi/:id/submit

GET    /api/documents
POST   /api/documents/upload
GET    /api/documents/:id
DELETE /api/documents/:id

GET    /api/submission-logs
GET    /api/settings/enum-mappings
PUT    /api/settings/enum-mappings
```

## 5. Konfigurasi R2

Semua konfigurasi teknis R2 wajib berada di backend environment.

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=student-connect-documents
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://dokumen.example.ac.id
R2_REGION=auto
R2_MAX_UPLOAD_MB=15
```

Frontend hanya menerima metadata aman:

```text
document_id
original_filename
public_url
mime_type
size_bytes
checksum
is_locked
created_at
```

Format object key:

```text
tenants/{tenant_slug}/simkatmawa/{tahun}/{record_type}/{record_id}/{document_type}/{uuid}-{safe_filename}
```

Contoh:

```text
tenants/ameta/simkatmawa/2026/prestasi-mandiri/pm-001/sertifikat/8f7c2a91-sertifikat-final.pdf
```

Aturan R2:

- Bucket boleh public read hanya untuk path dokumen bukti yang memang dikirim ke SIMKATMAWA.
- Tidak boleh ada directory listing.
- Object key wajib memakai UUID/random component.
- File tidak boleh overwrite object lama.
- Delete ditolak jika dokumen sudah terkunci.
- Public URL harus permanen agar tetap valid saat SIMKATMAWA memeriksa ulang dokumen.
- R2 secret tidak boleh muncul di frontend, log, error response, atau repository.

## 6. SIMKATMAWA Credential Handling

Frontend boleh menyediakan form:

- API base URL.
- Email akun SIMKATMAWA.
- Password akun SIMKATMAWA.
- Tombol uji koneksi.
- Status koneksi.

Namun penyimpanan dilakukan di backend:

```text
Frontend
→ POST /api/simkatmawa/credentials/test
→ Backend login/test ke SIMKATMAWA
→ Jika valid, backend simpan credential terenkripsi
→ Frontend hanya menerima status sukses/gagal
```

Tabel credential:

```text
simkatmawa_credentials
- id
- tenant_id
- api_url
- email
- encrypted_password
- encrypted_access_token
- token_expires_at
- is_connected
- last_checked_at
- last_error
- created_at
- updated_at
```

Aturan keamanan:

- Password dan token dienkripsi dengan AES-GCM/libsodium/age equivalent.
- Master key berasal dari environment atau secret manager.
- Token/password tidak pernah dikirim balik ke frontend.
- Error login tidak boleh membocorkan detail credential.
- Refresh token dilakukan backend.

## 7. Standar Keamanan ISO-Oriented

Kontrol berikut disejajarkan dengan praktik ISO/IEC 27001:2022. Implementasi ini bukan klaim sertifikasi, tetapi baseline kontrol aplikasi.

### 7.1 Access Control

- RBAC backend untuk semua endpoint.
- Role awal: SUPER_ADMIN, ADMIN_PT, ADMIN_KEMAHASISWAAN, ADMIN_PRODI, MAHASISWA, DOSEN_PEMBINA, AUDITOR.
- Backend tidak boleh percaya pada role dari frontend tanpa validasi session/token.
- Session/token memiliki expiry.
- Endpoint admin diberi audit log.

### 7.2 Secret Management

- Secret berada di environment atau secret manager.
- Tidak ada secret di repository.
- Tidak ada secret di localStorage.
- Tidak ada secret di client bundle.
- Rotasi credential harus didukung.

### 7.3 Cryptography

- TLS wajib di production.
- Password user di-hash dengan Argon2id/bcrypt yang kuat.
- Credential eksternal seperti SIMKATMAWA password/token dienkripsi, bukan di-hash, karena perlu dipakai ulang oleh backend.
- Checksum file disimpan untuk integrity check.

### 7.4 Logging and Audit

- Simpan audit log untuk login, update credential, upload dokumen, delete dokumen, submit SIMKATMAWA, dan perubahan enum mapping.
- Log tidak boleh menyimpan password/token.
- Payload log disensor untuk field sensitif.
- Setiap submit memiliki idempotency key.

### 7.5 Backup and Recovery

- Database backup terjadwal.
- R2 object versioning/lifecycle dipertimbangkan.
- Restore test dijadwalkan.
- Dokumen terkirim tidak boleh hilang tanpa prosedur recovery.

### 7.6 Secure Development

- Code review untuk modul credential, upload, export, dan submit.
- Dependency audit rutin.
- Static check dan test wajib sebelum release.
- Threat modeling minimal untuk fitur besar.

## 8. Antisipasi Celah Keamanan

### 8.1 SQL Injection

- Gunakan query builder/ORM SeaORM bawaan Loco.
- Tidak boleh string-concat SQL dari input user.
- Semua filter dan sorting memakai whitelist field.

### 8.2 XSS

- React escaping tetap dimanfaatkan.
- HTML dari user tidak dirender langsung.
- Jika butuh rich text, gunakan sanitizer allowlist.
- Filename dan message dari user harus diperlakukan sebagai text, bukan HTML.

### 8.3 CSRF

- Jika memakai cookie session, aktifkan CSRF protection.
- Jika memakai bearer token, pastikan CORS ketat dan token tidak disimpan di localStorage.

### 8.4 CSV/Excel Formula Injection

Semua export CSV/XLSX wajib mengamankan cell yang dimulai dengan:

```text
=
+
-
@
\t
\r
\n
```

Strategi:

- Prefix nilai berisiko dengan apostrophe `'`.
- Terapkan hanya saat export, bukan mengubah data asli.
- Kolom filename, nama mahasiswa, lomba, penyelenggara, keterangan, dan error message wajib disanitasi.

Contoh berbahaya:

```text
=HYPERLINK("http://attacker.test","click")
@SUM(1+1)
-cmd|' /C calc'!A0
```

### 8.5 File Upload Abuse

- Tipe file allowlist: PDF, JPG, JPEG, PNG.
- Validasi MIME dari content, bukan hanya extension.
- Batas ukuran default: 15 MB.
- Filename disanitasi.
- Object key memakai UUID.
- File tidak dieksekusi oleh server.
- Header download/view diset aman.
- Pertimbangkan antivirus scan untuk production.

### 8.6 Path Traversal

- Jangan gunakan path langsung dari user.
- Semua storage key dibuat oleh backend.
- Filename hanya menjadi suffix aman.
- Tolak `../`, slash, backslash, null byte, dan karakter kontrol.

### 8.7 SSRF

- Backend tidak boleh fetch URL arbitrary dari user tanpa allowlist.
- Preview dokumen sebaiknya langsung dari R2 public URL.
- Jika ada remote import, gunakan allowlist host dan blok IP private/internal.

### 8.8 IDOR

- Semua akses record memakai tenant_id dan permission check.
- User tenant A tidak boleh membaca dokumen tenant B.
- Public document URL boleh dibuka tanpa auth hanya untuk object bukti yang memang public.

### 8.9 Rate Limit and Abuse

- Rate limit endpoint login, test credential, upload, submit, dan export.
- Batasi retry submit SIMKATMAWA.
- Gunakan idempotency key untuk mencegah double submit.

### 8.10 Mass Assignment

- DTO request dipisahkan dari model database.
- Field seperti `is_locked`, `simkatmawa_id`, `created_by`, `tenant_id`, dan `sent_at` tidak boleh diisi langsung dari request user.

## 9. Efisiensi Operasional

### 9.1 Server

- Build backend dengan `cargo build --release`.
- Jalankan sebagai service systemd/container ringan.
- Static frontend dilayani CDN/Nginx/Caddy.
- Gunakan reverse proxy untuk TLS, compression, dan cache headers.
- Aktifkan request body limit.

### 9.2 Database

- PostgreSQL direkomendasikan untuk production.
- SQLite boleh untuk local development.
- Semua list endpoint memakai pagination.
- Tambahkan index pada:
  - tenant_id
  - status
  - created_at
  - record_type + record_id
  - simkatmawa_id
  - document_type

### 9.3 Background Jobs

- Submit SIMKATMAWA diproses async.
- UI menerima status QUEUED/SENDING/SENT/FAILED.
- Retry memakai exponential backoff.
- Job harus idempotent.

### 9.4 Logging

- Gunakan structured logging.
- Hindari log payload besar.
- Masking field sensitif.
- Retensi log disesuaikan kebutuhan audit.

## 10. Fase Pengerjaan

### Fase 0 - Baseline dan Keputusan Teknis

Output:

- Dokumen rencana ini disepakati.
- Stack final dipilih: React + Vite, Loco.rs, PostgreSQL, R2.
- Standar coding dan security baseline ditetapkan.
- Daftar environment variable dibuat.

Acceptance criteria:

- Semua pihak memahami bahwa credential dan R2 secret hanya ada di backend.
- Alur public document URL untuk SIMKATMAWA disetujui.

### Fase 1 - Restrukturisasi Monorepo

Output:

- Frontend dipindah ke `apps/web`.
- Backend Loco dibuat di `apps/api`.
- Root workspace dibuat.
- Script dev/build disiapkan.

Acceptance criteria:

- `web` bisa jalan seperti sekarang.
- `api` memiliki endpoint `/api/health`.
- Struktur repo siap dikembangkan paralel.

### Fase 2 - Backend Foundation

Output:

- Config environment backend.
- Koneksi database.
- Migration awal.
- Auth/session baseline.
- RBAC middleware.
- Audit log service.

Acceptance criteria:

- Backend bisa membaca config tanpa hardcoded secret.
- Endpoint dilindungi sesuai role.
- Aksi penting tercatat di audit log.

### Fase 3 - Data Model dan CRUD Inti

Output:

- Model tenant.
- Model prestasi mandiri.
- Model sertifikasi.
- Model rekognisi.
- Model kejuaraan.
- Model institusi.
- Model enum mapping.
- API CRUD awal.

Acceptance criteria:

- Data tidak lagi bergantung pada localStorage.
- Semua create/update divalidasi backend.
- Pagination tersedia untuk endpoint list.

### Fase 4 - R2 Document Service

Output:

- R2 config dari env.
- Upload dokumen via backend.
- Metadata dokumen tersimpan di database.
- Public URL permanen dibuat.
- Document lock diterapkan.

Acceptance criteria:

- Frontend tidak mengetahui R2 secret.
- Dokumen yang sudah terkirim tidak bisa dihapus.
- URL dokumen dapat dibuka publik untuk kebutuhan SIMKATMAWA.

### Fase 5 - SIMKATMAWA Credential dan Test Connection

Output:

- Endpoint test credential.
- Penyimpanan credential terenkripsi.
- Status koneksi.
- Refresh token backend.

Acceptance criteria:

- Password/token tidak tersimpan di browser.
- Frontend hanya melihat status koneksi dan metadata aman.
- Test login menghasilkan audit log.

### Fase 6 - Submit Workflow dan Queue

Output:

- Submit prestasi mandiri.
- Submit sertifikasi.
- Submit rekognisi.
- Background job.
- Retry dan idempotency.
- Submission log.

Acceptance criteria:

- Double submit dicegah.
- Dokumen dikunci setelah submit sukses.
- Log request/response tersimpan tanpa secret.
- UI dapat menampilkan status QUEUED/SENDING/SENT/FAILED.

### Fase 7 - Frontend API Migration

Output:

- `StorageService` diganti API client.
- Form settings memakai backend.
- Upload dokumen memakai backend.
- Dashboard membaca data dari backend.

Acceptance criteria:

- Tidak ada data operasional utama yang disimpan di localStorage.
- Error dari backend ditampilkan jelas.
- Role-based UI tetap mengikuti permission backend.

### Fase 8 - Security Hardening

Output:

- Rate limiting.
- CORS ketat.
- CSV injection protection.
- Upload hardening.
- Secure headers.
- Audit log masking.
- Dependency audit.

Acceptance criteria:

- Export CSV/XLSX aman dari formula injection.
- Endpoint sensitif dilindungi rate limit.
- File upload menolak tipe/ukuran tidak valid.
- Tidak ada secret di response/log/frontend bundle.

### Fase 9 - Performance and Efficiency Tuning

Output:

- Query profiling.
- Index database.
- Pagination semua list.
- Static asset caching.
- Release build backend.
- Baseline RAM/CPU.

Acceptance criteria:

- Endpoint list tidak mengambil data berlebihan.
- Backend dapat jalan stabil dengan footprint kecil.
- Upload dan submit tidak memblokir request utama terlalu lama.

### Fase 10 - Deployment Production

Output:

- Build pipeline.
- Reverse proxy TLS.
- Environment production.
- Backup database.
- Monitoring dan alerting.
- Runbook incident.

Acceptance criteria:

- Frontend dapat diakses publik.
- Backend API berjalan di TLS.
- Backup dan restore sudah dites.
- Monitoring minimal aktif.

## 11. Definition of Done Global

Sebuah fase dianggap selesai jika:

- Kode berjalan secara lokal.
- Test minimal untuk logic kritis tersedia.
- Tidak ada secret hardcoded.
- Validasi backend aktif.
- Audit log tersedia untuk aksi penting.
- Dokumentasi endpoint/config diperbarui.
- Performa tidak menurun secara tidak perlu.

## 12. Prioritas Risiko

Prioritas tertinggi:

1. Credential SIMKATMAWA bocor.
2. R2 secret bocor.
3. Dokumen terkirim bisa dihapus/diubah.
4. Double submit ke SIMKATMAWA.
5. CSV formula injection saat export.
6. File upload berbahaya.
7. IDOR antar tenant.
8. Query tanpa pagination yang membebani server.

## 13. Kesimpulan Keputusan

Kesepakatan arah teknis:

- Backend menggunakan Loco.rs/Rust untuk efisiensi dan keamanan server.
- Frontend tetap React + Vite.
- Secret dan credential hanya berada di backend.
- R2 dikonfigurasi lewat environment backend.
- Link dokumen untuk SIMKATMAWA berupa public permanent URL dengan object key acak.
- Workflow submit memakai backend job, idempotency, audit log, dan document locking.
- Keamanan mengikuti baseline ISO/IEC 27001:2022 secara implementatif, ditambah mitigasi khusus untuk CSV injection, file upload abuse, SSRF, IDOR, dan mass assignment.
