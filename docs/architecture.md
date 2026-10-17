# Arsitektur Student Connect

## Komponen

```text
Browser (React SPA) ──HTTPS──▶ Caddy ──┬─ /      → apps/web/dist (statis)
                                        └─ /api   → Loco server :5150 ──▶ PostgreSQL
                                                         │  └─ antrean job (tabel Postgres)
                                                         ├──▶ Cloudflare R2 (dokumen, tautan publik permanen)
                                                         └──▶ SIMKATMAWA API (hanya dari worker/server)
```

SPA dan API dilayani dari satu origin (reverse proxy) sehingga cookie sesi `SameSite=Strict` bekerja tanpa CORS.

## Backend (`apps/server`)

Mengikuti konvensi Loco: model gemuk, controller tipis, rahasia hanya lewat `config/*.yaml`.

| Lapisan | Isi |
|---|---|
| `models/` | Entitas SeaORM (`_entities`), validasi, transisi status, kueri berlingkup tenant |
| `controllers/` | auth, tenant, users, records, kejuaraan, institusi, documents, simkatmawa, settings, logs, dashboard |
| `security/` | RBAC, sesi/CSRF (`Principal`), brankas AES-GCM, rate limit, sniff file, CSV aman, anti-SSRF, kebijakan sandi |
| `integrations/simkatmawa.rs` | Klien API + penyusun payload (§3 panduan) |
| `workers/submit_simkatmawa.rs` | Pengiriman idempoten ke SIMKATMAWA |
| `tasks/` | `bootstrap`, `sessions:purge`, `submissions:recover`, `audit:verify` (dijadwalkan di `scheduler:`) |
| `migration/` | Skema Postgres lengkap dengan CHECK constraint, trigger, dan indeks |

### Endpoint (semua di bawah `/api`, kecuali `login` wajib sesi + CSRF)

```text
POST /auth/login · POST /auth/logout · GET /auth/me · POST /auth/change-password
GET  /dashboard
GET|PUT /tenant
GET|POST /users · PATCH /users/{id} · POST /users/{id}/reset-password
GET|POST /records/{kind} · GET|PUT|DELETE /records/{kind}/{id} · GET /records/{kind}/export
POST /records/{kind}/{id}/(submit-internal|verify|request-revision|cancel|queue)
   kind = prestasi-mandiri | sertifikasi | rekognisi
GET|POST /kejuaraan · GET|PUT|DELETE /kejuaraan/{id}
GET|PUT /institusi/{tahun}
GET|POST /documents (multipart) · GET|DELETE /documents/{id}
GET /simkatmawa/status · POST /simkatmawa/credentials/test · PUT|DELETE /simkatmawa/credentials · POST /simkatmawa/refresh-token
GET|PUT /settings/enum-mappings
GET /submission-logs · GET /audit-logs · GET /audit-logs/verify
GET  /sso/config · GET /sso/login · GET /sso/callback        (login Portal; lihat docs/sso-portal-integrasi.md)
GET  /lookups/mahasiswa?q= · GET /lookups/dosen?q=          (pilihan dari data master Portal)
GET  /master-sync · POST /master-sync/run                    (status + pemicu sinkron data master)
GET /_ping /_health   (bawaan Loco)
```

### Siklus status record

```text
DRAFT ─▶ SUBMITTED_INTERNAL ─▶ VERIFIED ─▶ QUEUED ─▶ SENDING ─▶ SENT
   ▲            │                   │         ▲          │
   └─ NEED_REVISION ◀───────────────┘         └─ FAILED ◀┘     CANCELLED (dari status pra-kirim)
```

* Status hanya berubah lewat transisi di model (kunci baris `FOR UPDATE`); body request yang memuat `status`, `tenant_id`, dsb. ditolak (`deny_unknown_fields`).
* `QUEUED→SENDING` memakai compare-and-set: job ganda tidak mengirim dua kali.
* Gangguan sementara → `QUEUED` lagi (maks 5 percobaan lalu `FAILED`). `SENDING` macet >30 menit **tidak** dikirim ulang otomatis (hasil tak pasti) melainkan `FAILED` untuk diperiksa admin.
* Setelah `SENT`, dokumen terkait terkunci (aplikasi + trigger database).

## Keputusan yang perlu dikonfirmasi ke pengelola SIMKATMAWA

Dari panduan §4: masa berlaku token (diasumsikan 50 menit, login ulang saat 401), kode error/rate limit, perilaku `bentuk` hibrida, level `KAB` pada rekognisi (flag `allow_kab_rekognisi`), status data hasil API (Submitted/Verified), dan lolos tidaknya panggilan server dari verifikasi Cloudflare.

## Katalog indikator Institusi

Panduan hanya memuat judul kelompok dan jumlah butir (bukan redaksi tiap butir, dan totalnya tidak persis 70). `packages/contracts/src/institusi.ts` membuat butir bernomor per kelompok; salin redaksi resmi dari halaman `/institusi` SIMKATMAWA ke `items` dan samakan `GROUPS` di `models/institusi_reports.rs`.
