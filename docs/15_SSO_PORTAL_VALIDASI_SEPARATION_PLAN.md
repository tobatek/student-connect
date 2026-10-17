## Status implementasi Tahap 1

- Login Google (Socialite) sudah jalan **sebagai tambahan**, bukan pengganti: login
  email/password & NIM/password lama tetap aktif (keputusan rollout additive).
- Pencocokan akun: email Google dicocokkan ke `users.email` → `students.email` → `employees.email`
  (auto-provision User baru hanya kalau ada match di Master Data, bukan pendaftaran terbuka).
- Step-up re-auth Google untuk `app.sso.manage` (aksi tulis) sudah aktif via middleware
  `fresh.google`, jendela 10 menit.
- Endpoint `/api/sso/authorize` (sesi Sanctum, dipanggil SPA Portal) + `/api/sso/verify` (token
  aplikasi, server-to-server) sudah jalan dengan amplop AES-256-GCM (kunci diturunkan dari
  `token_hash` via HKDF, lihat komentar di `SsoCryptoService`).
- **Belum bisa dites end-to-end sungguhan**: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` di
  `apps/api/.env` masih kosong (butuh dibuat manual di Google Cloud Console oleh pemilik akun
  Google institusi). Kode sudah lengkap & teruji via 17 feature test (Socialite di-mock).
- Belum dikerjakan: menghapus login lama (menunggu Google login terbukti stabil di produksi),
  aplikasi "dummy" nyata untuk uji `/sso/authorize`+`/sso/verify` dari luar Portal (baru diuji via
  feature test internal).

## Catatan penamaan

Repo ini (`student_connect`) secara historis dibangun sebagai aplikasi kemahasiswaan, dan
fitur Portal/Hub ditambahkan belakangan di atasnya, sehingga kode student connect justru lebih banyak
daripada kode Portal saat ini.

## Keputusan inti

- Hanya **2 basis kode**: **Portal** (repo yang sekarang, dapat modul SSO + Master Data baru) dan
  **Validasi** (repo baru, mandiri, hasil ekstraksi dari repo ini).
- SSO **tidak** jadi servis ke-3, menyatu sebagai modul di Portal.
- SSO tetap tipis: hanya mengelola *identitas* (siapa orangnya) dan *role admin/user untuk SSO itu
  sendiri* (siapa boleh kelola aplikasi terdaftar). **Hak akses di dalam tiap aplikasi (Validasi,
  dst.) sepenuhnya diurus aplikasi itu sendiri**. SSO tidak menyimpan matriks role-per-aplikasi.
- Login: **semua orang (staff maupun mahasiswa) login pakai Google** (Workspace institusi untuk
  staff, email Google apa saja untuk mahasiswa), dicocokkan ke data yang sudah terdaftar di
  Master Data Portal berdasarkan email. Tidak ada akun NIM+password yang di-generate terpisah.
- Role admin SSO wajib step-up re-auth Google (lapis MFA) karena bisa kelola aplikasi & token.

## Tahap 0: Master Data Organisasi & Orang (Portal), **prasyarat sebelum SSO bisa jalan**

SSO butuh data ini lebih dulu untuk mencocokkan email saat login, dan aplikasi lain (Validasi,
serta modul masa depan seperti Kuisioner Kepuasan Mahasiswa) butuh data lengkap yang sama supaya
update cukup dilakukan sekali di satu tempat.

### Hierarki data

```
work_units (unit organisasi, hierarkis via parent_id: fakultas/direktorat/biro)
   └─ study_programs (prodi, punya work_unit_id → unit akademik)
         └─ students (NIM, biodata, punya study_program_id)

work_units
   └─ employees (BARU, pegawai nempel langsung ke unit kerja, tidak lewat prodi)
```

`work_units` dan `study_programs` sudah ada di skema sekarang dan **tetap di Portal** (sudah sesuai
posisi aslinya). `students` **pindah kepemilikannya ke Portal**: repo ini sekarang punya kolom
NIM, siakad_student_id, full_name, nik, birth_place, birth_date, gender, mother_name, email, phone,
study_program_id, cohort_year, academic_status (lihat `2026_08_16_185216_create_students_table.php`).
Skema itu jadi basis tabel master di Portal. `employees` adalah tabel baru, kolom setara
(NIP, nama, email, phone, work_unit_id, jabatan/status kepegawaian).

### Pembagian data: core vs sensitif (disepakati)

API master data Portal membagi respons jadi 2 lapis, bukan expose semua kolom ke semua aplikasi
secara default:

- **Core identity** (dikirim ke semua app yang terdaftar): NIM/NIP, nama, email, prodi/unit,
  status aktif.
- **Data sensitif** (NIK, tanggal lahir, nama ibu kandung): hanya dikirim ke app yang memang
  butuh (mis. Validasi untuk pencocokan dokumen), digerbangi scope/izin khusus per token aplikasi
  di halaman admin "Integrasi Aplikasi", tidak otomatis ikut ke semua app.

### Konsumsi oleh aplikasi lain

- Portal expose API read-only: `GET /api/master/students`, `GET /api/master/employees`,
  `GET /api/master/study-programs`, `GET /api/master/work-units`, diproteksi pakai token aplikasi
  yang sama dengan mekanisme SSO (tidak perlu sistem auth API kedua).
- Aplikasi lain **tidak menulis** ke data ini langsung: koreksi data mahasiswa/pegawai harus
  lewat Portal (single source of truth).
- Tiap aplikasi menyimpan **cache lokal read-only** (tabel mirror) supaya tidak selalu panggil API
  Portal secara langsung dan tidak ikut down kalau Portal maintenance, disinkron lewat webhook
  dari Portal saat data berubah, plus endpoint "resync manual" sebagai fallback kalau webhook gagal.
  Tabel `students` yang sekarang ada di repo Validasi berubah fungsi jadi cache ini, bukan sumber
  kebenaran lagi.

## Tahap 1: Modul SSO di Portal

- Pasang Laravel Socialite (Google) untuk staff (dibatasi domain Workspace via param `hd`) dan
  mahasiswa (email Google apa saja, dicocokkan ke `students.email` di Master Data).
- Kalau email hasil login Google tidak ditemukan di Master Data → ditolak ("akun belum terdaftar,
  hubungi admin").
- Migrasi `sso_applications`: `name`, `website_url`, **`redirect_uris` (allowlist, bukan cuma
  website_url)**, `token_hash`, `is_active`, `created_by`, timestamps.
- Permission baru `app.sso.manage` di `PermissionRegistry.php`, default super_admin saja + step-up
  re-auth Google (redirect ulang `prompt=login`, cek response beberapa menit terakhir) untuk aksi
  sensitif (CRUD aplikasi terdaftar, generate/regenerate token).
- Endpoint:
  - `POST /api/sso/authorize`: mulai alur, validasi `redirect_uri` terhadap allowlist tersimpan
    (mencegah open-redirect).
  - `POST /api/sso/verify`: tukar kode otorisasi (short-lived, sekali pakai) → identitas user,
    payload request & response dienkripsi **AES-256-GCM** (authenticated encryption, sekaligus
    jadi mekanisme signature: kalau auth tag tidak cocok, payload dianggap dipalsukan/rusak).
    Key AES diturunkan dari token aplikasi via HKDF (bukan token mentah dipakai langsung sebagai
    key). Payload wajib bawa nonce + timestamp untuk proteksi replay, terpisah dari
    sekali-pakainya kode otorisasi itu sendiri.
- Halaman admin "Integrasi Aplikasi": daftar aplikasi terdaftar, tambah aplikasi (nama + website +
  redirect URIs → generate token, ditampilkan sekali), regenerate token, nonaktifkan aplikasi,
  atur scope akses data sensitif master data per aplikasi.
- Alur login end-to-end dari aplikasi luar (mis. Validasi):
  1. User klik "Login" di app luar → redirect ke `Portal /sso/authorize?app=...&redirect_uri=...`.
  2. Kalau belum ada sesi Portal → tampil pilihan login Google (staff/mahasiswa). Kalau sudah ada
     sesi aktif → langsung lanjut.
  3. Portal redirect balik ke `redirect_uri` app luar bawa kode otorisasi.
  4. Backend app luar panggil `POST /api/sso/verify` bawa kode itu (server-to-server, terenkripsi
     AES-256-GCM pakai token appnya).
  5. Portal balas identitas user (terenkripsi juga).
  6. App luar cocokkan/buat akun lokalnya sendiri dari identitas itu, terapkan RBAC miliknya
     sendiri (independen dari role Portal).
- **Setiap aplikasi yang bukan Portal tidak boleh punya form login sendiri**: semua wajib
  redirect ke alur ini.
- Single logout (SLO) lintas app **belum full push-based**: Portal tidak bisa memanggil balik
  app luar untuk memaksa logout. Yang tersedia adalah `/api/sso/session-status` (poll-based, lihat
  bagian "Kontrak integrasi untuk aplikasi eksternal" di bawah): app luar yang mau ikut idle
  timeout Portal harus polling sendiri secara berkala. Logout paksa instan (mis. admin
  menonaktifkan user) tetap belum ada mekanismenya di app luar sampai polling berikutnya jalan.

## Kontrak integrasi untuk aplikasi eksternal

Referensi lengkap untuk tim yang mengintegrasikan aplikasi baru (di luar repo Portal ini) ke SSO
Portal. Tiga endpoint, dua di antaranya server-to-server (dipanggil backend app luar, **bukan**
browser user) dan dienkripsi dengan pola amplop yang sama.

### Ringkasan alur

```
1. Browser user klik "Login" di App Luar
     → redirect ke Portal: GET /sso/authorize?client_id=...&redirect_uri=...
2. Portal (kalau belum ada sesi) minta user login Google, lalu tampilkan
   layar konfirmasi otorisasi App Luar
     → SPA Portal (browser, sesi Sanctum user) panggil
       POST /api/sso/authorize
     → Portal redirect balik ke redirect_uri App Luar bawa `code` (1x pakai, hidup 60 detik)
3. Backend App Luar tukar code:
     → POST /api/sso/verify   (server-to-server, app token)
     → dapat identitas user (nama, email, NIM/NIP, roles untuk app ini)
4. App Luar buat sesi/akun lokalnya sendiri dari identitas itu, sepenuhnya independen dari
   sesi Portal sejak titik ini.
5. (opsional, disarankan) App Luar polling berkala:
     → POST /api/sso/session-status   (server-to-server, app token)
     → kalau `active: false`, App Luar logout sesi lokalnya sendiri,
       supaya idle timeout Portal (default 30 menit) ikut berlaku di App Luar.
```

### Autentikasi & enkripsi (berlaku untuk `/sso/verify` dan `/sso/session-status`)

- Auth: header `Authorization: Bearer <app_token>`. Token didapat sekali saat aplikasi
  didaftarkan di halaman admin Portal "Integrasi Aplikasi" (`/admin/settings/sso-applications`),
  ditampilkan sekali saat generate/regenerate, simpan di secret manager App Luar, jangan di
  repo/commit.
- Body request & response: amplop AES-256-GCM `{ nonce, ciphertext, tag }`, semua base64.
  - Kunci AES = `HKDF-Expand(sha256(app_token), 32 bytes, info="sso-verify-v1")`: App Luar
    men-derive kunci dari token mentahnya sendiri (bukan dari hash yang dikirim Portal, App Luar
    tidak pernah menerima hash itu, App Luar cuma tahu token mentahnya sendiri).
  - Auth tag GCM berfungsi ganda sebagai signature: tag tidak cocok → payload dianggap dipalsukan
    atau salah kunci, endpoint balas `401`.
  - Lihat implementasi referensi di `apps/api/app/Services/SsoCryptoService.php` (PHP) untuk
    detail exact byte-for-byte; port ke bahasa App Luar mengikuti kontrak yang sama.

### `POST /api/sso/authorize`: browser leg (dipanggil SPA Portal sendiri)

App Luar **tidak memanggil endpoint ini**, cukup redirect browser user ke halaman `/sso/authorize`
Portal dengan query `client_id` (UUID aplikasi) dan `redirect_uri` (harus persis salah satu yang
terdaftar di allowlist `redirect_uris` aplikasi, exact match, bukan prefix match).

### `POST /api/sso/verify`: tukar kode → identitas (server-to-server)

Request (plaintext sebelum dienkripsi):
```json
{ "code": "<code dari query redirect_uri>" }
```

Response (plaintext setelah didekripsi):
```json
{
  "id": "uuid-user-portal",
  "email": "user@stikesadvaitamedika.ac.id",
  "name": "Nama Lengkap",
  "type": "student | staff",
  "nim": "opsional, hanya untuk student",
  "nip": "opsional, hanya untuk staff",
  "roles": ["role-code-untuk-app-ini", "..."]
}
```
`code` sekali pakai dan kedaluwarsa 60 detik sejak diterbitkan. Tukar segera setelah redirect
diterima, jangan disimpan/diantrikan.

### `POST /api/sso/session-status`: cek idle timeout (server-to-server, opsional tapi disarankan)

Ditambahkan untuk App Luar yang ingin ikut menerapkan idle timeout Portal (default 30 menit,
`config('sanctum.idle_timeout')` di Portal) tanpa harus reimplement logikanya sendiri dari nol.
"Aktif" diukur dari kapan terakhir user itu memanggil API Portal lewat SPA-nya sendiri. App Luar
memanggil endpoint ini, App Luar sendiri **tidak** memengaruhi hitungan idle-nya.

Request (plaintext sebelum dienkripsi):
```json
{ "email": "user@stikesadvaitamedika.ac.id" }
```

Response (plaintext setelah didekripsi):
```json
{ "active": true, "idle_timeout_minutes": 30 }
```

Rekomendasi pemakaian: polling tiap 1-5 menit selama user punya sesi App Luar yang masih terbuka;
begitu `active: false`, App Luar logout sesi lokalnya dan arahkan user untuk login ulang lewat
alur `/sso/authorize`. Ini best-effort/poll-based, bukan push instan, jadi ada jeda maksimal
seinterval polling sebelum App Luar benar-benar ikut logout.

## Tahap 2: Ekstrak Validasi jadi repo baru

- `git init` repo baru di lokasi yang ditentukan user, isi hasil ekstraksi kode domain Validasi:
  `ValidationCampaign`, `CampaignStudent`, `StudentFieldValue`, `StudentDocument`,
  `DeclarationDocument`, `DeclarationTemplate`, `DocumentType`, `SupplementalField`,
  `NotificationSetting`/`Log`, `ExportBatch`, `ConsentEvent`, `ReviewEvent`, controller & halaman
  terkait (Operator, Student campaign flow, PublicApi verification).
- Struktur repo baru meniru pola monorepo yang sekarang: `apps/api` + `apps/web`, supaya tooling
  Docker/CI/Coolify tinggal disalin pola, bukan didesain ulang.
- Hapus auth lokal (Sanctum login/studentLogin). Pasang sisi client SSO (redirect ke Portal,
  tukar kode via `/api/sso/verify`, dekripsi AES-256-GCM).
- `students` di repo Validasi jadi cache read-only dari Master Data Portal (lihat Tahap 0),
  bukan lagi sumber kebenaran biodata mahasiswa. Data workflow validasi (campaign, dokumen,
  field value) tetap sepenuhnya milik Validasi.
- Bawa & sesuaikan pola `Role`/`RolePermission`/`PermissionRegistry`/`user_roles` jadi milik
  Validasi sendiri (database sendiri, duplikasi kode diterima sebagai utang teknis tahap awal,
  tidak dijadikan shared package dulu).
- Belum diputuskan, perlu direncanakan sebelum eksekusi: strategi split frontend SPA (`apps/web`
  sekarang satu app dengan `features/admin` campur hub+validasi, perlu dipisah konkret bukan cuma
  "halaman diekstrak"), migrasi data produksi (Student existing, dokumen ter-upload, audit log)
  saat cutover, dan nasib link publik verifikasi dokumen (`features/verify`) yang sudah beredar di
  dokumen tercetak.
- Kode Validasi lama di repo Portal baru dihapus **setelah** repo baru terbukti jalan end-to-end
  (bukan sebelum itu).

## Struktur folder & repo

- **Portal** (`apps_validasi_data_pddikti` sekarang): `apps/api` + `apps/web`, modul SSO
  dikelompokkan jelas: `app/Http/Controllers/Api/Sso/*` di backend, `features/sso/` terpisah dari
  `features/admin/` di frontend (jangan ditaruh campur ke folder admin yang sudah flat). Modul
  Master Data serupa: `app/Http/Controllers/Api/Master/*`, `features/master-data/`.
- **Validasi** (repo baru): pola monorepo yang sama (`apps/api` + `apps/web`), `docs/` disalin &
  disunting scope-nya sendiri (bukan bawa semua 15 file docs gabungan), `infra/` &
  `docker-compose.coolify.yml` sendiri. Deploy sebagai project Coolify terpisah, domain & DB
  sendiri, tidak share folder infra lintas repo.

## Verifikasi

**Tahap 0:**
- Import/CRUD Master Data mahasiswa & pegawai berhasil, `nim`/`nip`/`email` unique tervalidasi.
- API `/api/master/*` menolak request tanpa token aplikasi valid; field sensitif hanya muncul
  untuk app dengan scope yang diizinkan.

**Tahap 1:**
- Login Google staff berhasil (domain Workspace), ditolak kalau bukan domain institusi.
- Login Google mahasiswa berhasil kalau email cocok data Master Data, ditolak kalau tidak terdaftar.
- Generate token aplikasi dummy → `/api/sso/verify` dengan payload benar → dapat identitas balik;
  payload dengan token salah/signature rusak/redirect_uri di luar allowlist → ditolak.
- Akses halaman "Integrasi Aplikasi" tanpa permission `app.sso.manage` → ditolak; dengan permission
  tapi tanpa step-up re-auth terbaru → diminta re-auth dulu.
- `php artisan test` hijau.

**Tahap 2:**
- Login end-to-end dari app Validasi baru lewat Portal berhasil, cache Student tersinkron benar.
- Role/permission Validasi tetap berfungsi, sepenuhnya independen dari role di Portal.
- `php artisan test` hijau di kedua repo.
