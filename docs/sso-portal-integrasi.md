# Integrasi SSO Portal dan sinkronisasi data master

Aplikasi ini bertindak sebagai **aplikasi luar** bagi Portal. Kontrak Portal ada di `docs/15_SSO_PORTAL_VALIDASI_SEPARATION_PLAN.md`. Dokumen ini menjelaskan sisi aplikasi ini.

## 1. Alur login

```text
Browser            Student Connect (API)                 Portal
   | GET /api/sso/login  |                                   |
   |-------------------->| buat state (acak + waktu), cookie |
   |<-- 303 -------------| HttpOnly, SameSite=Lax            |
   | GET {portal}/sso/authorize?client_id&redirect_uri&state  |
   |--------------------------------------------------------->| login Google, konfirmasi
   |<-- 303 {redirect_uri}?code&state -------------------------|
   | GET /api/sso/callback?code&state                          |
   |-------------------->| cek state = cookie, belum kedaluwarsa
   |                     | POST /api/sso/verify  (AES-256-GCM, Bearer app_token)
   |                     |---------------------------------->|
   |                     |<-- identitas (terenkripsi) -------|
   |                     | cocokkan/buat akun lokal, sesi baru
   |<-- 303 / + cookie sesi (HttpOnly, SameSite=Strict)
```

Keputusan keamanan:

- `state` terikat ke cookie browser (anti login-CSRF). Cookie state memakai `SameSite=Lax` karena callback adalah navigasi lintas situs; cookie `Strict` tidak akan terkirim.
- Tujuan redirect hanya dari konfigurasi. Tidak ada nilai dari query yang dipakai sebagai URL.
- Kode otorisasi sekali pakai, hanya ditukar di backend, tidak pernah diulang otomatis.
- Balasan Portal yang tag GCM-nya tidak cocok ditolak. Isi respons Portal tidak masuk log.
- Sesi baru tiap login (anti session fixation). RBAC tetap milik aplikasi ini.

## 2. Klaim Portal dan pemetaan ke akun lokal

| Klaim Portal | Dipakai untuk |
|---|---|
| `id` (UUID) | `users.portal_user_id` (unik). Kunci utama pencocokan akun. |
| `email` | Pencocokan akun lama (sekali, lalu terikat ke `id`), dan pencocokan data master. |
| `name` | Nama akun baru (nama pada formulir tetap dari data master). |
| `type` = `student` | Akun baru berperan `sso.default_student_role` (default `MAHASISWA`). |
| `type` = `staff` | Akun baru hanya dibuat bila salah satu `roles` ada di `sso.role_map`. |
| `nim` | `users.nim`, dipakai mengisi formulir mahasiswa otomatis. |
| `nip` | Pencocokan pegawai di data master. |
| `roles` | Dipetakan lewat `sso.role_map` (hak terbesar menang). Tidak mengubah peran akun yang sudah ada. |

Aturan:

- Akun lokal yang sudah ada (dibuat admin) diikat ke identitas Portal pada login pertama bila emailnya sama dan belum terikat. Email yang sudah terikat ke identitas lain ditolak.
- Staf tanpa pemetaan peran dan tanpa akun lokal ditolak ("belum terdaftar").
- `role_map` tidak boleh memetakan ke `SUPER_ADMIN` (aplikasi menolak boot).
- Bila `MASTER_SYNC_ENABLED=true`, akun baru hanya dibuat untuk email yang ada di data master aktif.

Contoh peran admin (di `config/<env>.yaml`):

```yaml
sso:
  role_map:
    kemahasiswaan: ADMIN_KEMAHASISWAAN   # verifikator
    dosen: DOSEN_PEMBINA
```

## 3. Formulir mahasiswa dan dosen

- Akun **MAHASISWA**: NIM dan nama terisi otomatis dari Portal dan dipaksa server (baris pertama, tidak bisa diubah). Anggota tim lain dipilih dari pencarian `/api/lookups/mahasiswa`.
- **Dosen pendamping** dipilih dari `/api/lookups/dosen` (pegawai ber-NUPTK di data master). Tidak ada isian bebas NUPTK/nama.
- Saat sinkronisasi aktif, server menolak NIM/NUPTK yang tidak ada di data master dan mengganti nama dengan nama resmi.
- Alur verifikasi: mahasiswa membuat draf, **Ajukan verifikasi**, admin **Verifikasi** (atau **Minta revisi**), lalu hanya peran dengan izin kirim yang bisa **Kirim ke SIMKATMAWA**. Data berstatus menunggu verifikasi tidak bisa diubah pemiliknya.

## 4. Pengiriman ke SIMKATMAWA: pencegahan data ganda

1. Transisi `QUEUED → SENDING` adalah compare-and-set; job ganda berhenti.
2. Hanya status `VERIFIED` atau `FAILED` yang bisa masuk antrean.
3. Gagal tersambung atau HTTP 429/503: aman diulang otomatis (maks 5).
4. **Timeout, koneksi putus, atau HTTP 5xx lain setelah data terkirim: status `FAILED` dengan catatan "hasil tidak pasti"**, tidak diulang otomatis. Admin memeriksa SIMKATMAWA dulu sebelum menekan kirim ulang.
5. Sertifikat yang sama (jenis + tautan) untuk mahasiswa yang sama yang sudah dikirim atau antre ditolak.
6. Indeks unik `(tenant, jenis, simkatmawa_id)` di database.

Batas yang tersisa: SIMKATMAWA tidak mendokumentasikan kunci idempotensi, jadi dedup di sisi mereka tidak bisa diandalkan. Tombol kirim ulang setelah "hasil tidak pasti" tetap bisa menggandakan bila data sebenarnya sudah masuk.

## 5. Tautan publik

Sebelum masuk antrean, setiap tautan harus: bukan `localhost`/IP privat/host internal (`*.local`, `*.internal`, tanpa titik), dan untuk berkas yang kita simpan sendiri (`storage.public_base_url`) harus menjawab 2xx tanpa login. Gagal berarti kirim ditolak dengan nama kolom yang bermasalah. Unggahan mengisi kolom tautan otomatis dengan URL publik permanen, bahkan pada formulir baru (UUID draf dibuat klien).

Prasyarat produksi: bucket R2 baca-publik pada prefix `tenants/` (lihat `docs/security-controls.md`).

## 6. Sinkronisasi master

| Hal | Perilaku |
|---|---|
| Sumber | `GET /api/master/students`, `GET /api/master/employees` (Bearer token aplikasi), parameter `page`, `per_page`, `updated_since`. |
| Jadwal | `sync:master` harian 02:00 (`scheduler:`). Manual: `POST /api/master-sync/run` atau `cargo loco task sync:master`. |
| Paginasi | Penuh sampai halaman terakhir; batas `max_pages`; jeda `page_delay_ms`. |
| Gangguan | Retry + backoff eksponensial (maks `max_attempts`), timeout, batas ukuran respons. |
| Upsert | Berdasarkan NIM/NIP per tenant; baris tanpa perubahan inti tidak ditulis ulang. |
| Hilang dari sumber | Ditandai nonaktif, tidak dihapus. Hanya setelah lintasan penuh tanpa galat fetch, dan dibatalkan bila lebih dari `max_deactivate_percent` (30%) data aktif akan hilang sekaligus. |
| Inkremental | `mode=incremental` memakai `updated_since` = awal run SUCCESS terakhir; tidak pernah menonaktifkan data. |
| Log | Tabel `sync_runs` (baru/berubah/tetap/nonaktif/gagal) dan `audit_logs`. Tanpa data pribadi. |
| Data sensitif | NIK, tanggal lahir, nama ibu tidak disimpan. |

Medan respons yang dibaca (nama alternatif didukung): mahasiswa `nim`, `nama|name|full_name`, `email`, `prodi|study_program`, `angkatan|cohort_year`, `is_active|status`, `updated_at`. Pegawai `nip|nidn`, `nama`, `email`, `unit|work_unit`, `jabatan|position`, **`nuptk`**, `is_active|status`.

## 7. Cara uji

Backend jalan (`pnpm db:up`, `pnpm dev:server`), `SSO_ENABLED=true`, dan akun SUPER_ADMIN dari `bootstrap`.

```bash
# 1. Status SSO untuk SPA
curl -s http://localhost:5150/api/sso/config

# 2. Mulai login: harus 303 ke {portal}/sso/authorize?...&state=... dan Set-Cookie sc_session_sso (Lax)
curl -si http://localhost:5150/api/sso/login | head -12

# 3. Callback tanpa cookie state harus ditolak (303 ke /masuk?sso_error=state)
curl -si "http://localhost:5150/api/sso/callback?code=abc&state=palsu" | head -5

# 4. Amplop terenkripsi untuk menguji Portal langsung (token dari env, bukan argumen)
export SSO_APP_TOKEN='...token aplikasi...'
BODY=$(node scripts/sso-envelope.mjs seal '{"code":"KODE_DARI_REDIRECT","nonce":"'$(uuidgen)'","timestamp":'$(date +%s)'}')
curl -s -X POST "$SSO_PORTAL_BASE_URL/api/sso/verify" \
  -H "Authorization: Bearer $SSO_APP_TOKEN" -H 'Content-Type: application/json' -d "$BODY" \
  | xargs -0 -I{} node scripts/sso-envelope.mjs open '{}'

# 5. Sinkronisasi dari CLI dan hasilnya
cd apps/server && cargo loco task sync:master kind:students
```

Sinkron manual lewat API (setelah login, butuh cookie sesi dan header CSRF dari `/api/auth/me`):

```bash
curl -s -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"kind":"all","mode":"full"}' http://localhost:5150/api/master-sync/run
curl -s -b cookies.txt http://localhost:5150/api/master-sync
```

Tes otomatis: `cd apps/server && cargo test --lib` (kontrak amplop, klien Portal tiruan, normalisasi, aturan tautan) dan `pnpm test:web`.

## 8. Checklist go-live

- [ ] Aplikasi didaftarkan di Portal; `redirect_uri` persis sama dengan `SSO_REDIRECT_URI` (https).
- [ ] `SSO_APP_TOKEN` hanya di secret manager; token lama dirotasi bila pernah tercetak.
- [ ] Tim Portal mengonfirmasi poin "Asumsi" di bawah.
- [ ] `sso.role_map` terisi; ada minimal satu admin kemahasiswaan yang bisa login lewat Portal sebelum login sandi dimatikan.
- [ ] Sinkron penuh pertama berhasil (`sync_runs` SUCCESS); jumlah mahasiswa/dosen masuk akal; dosen ber-NUPTK muncul di dropdown.
- [ ] Login mahasiswa uji: NIM dan nama terisi, dosen dari dropdown, unggah mengisi tautan.
- [ ] Alur verifikasi uji sampai kirim ke SIMKATMAWA; tautan di SIMKATMAWA terbuka tanpa login.
- [ ] Bucket R2 publik baca; `HEAD` ke satu berkas unggahan menjawab 200 dari jaringan luar.
- [ ] Proses `scheduler` dan worker berjalan (`sync:master`, `sso:sessions-check`).
- [ ] Login Portal stabil beberapa hari, lalu `SSO_PASSWORD_LOGIN_ENABLED=false`. Siapkan jalur darurat (set ulang variabel ke `true`).
- [ ] `cargo audit`, `pnpm audit`, dan review keamanan independen.

## 9. Asumsi yang perlu dikonfirmasi ke tim Portal

1. **`state`**: Portal harus meneruskan parameter `state` apa adanya ke `redirect_uri`. Kontrak tidak menyebutnya; tanpa itu callback menolak semua login (gagal tertutup).
2. **Payload verify/session-status**: kami menambahkan `nonce` dan `timestamp` (kontrak Tahap 1 menyebutnya wajib; contoh request hanya `code`). Byte-per-byte amplop (nonce 12 byte, tanpa AAD, tag terpisah 16 byte, kunci `HKDF-Expand(sha256(token), 32, "sso-verify-v1")`) sudah diuji silang dengan implementasi Node independen, **belum** dengan `SsoCryptoService.php`.
3. **Bentuk respons `/api/master/*`**: paginasi gaya Laravel (`data`, `meta.last_page` atau `next_page_url`), JSON polos (tidak terenkripsi), field seperti di bagian 6, dan **ada `nuptk` untuk dosen**. Bila nama field berbeda, ubah `models/master_data.rs`.
4. **Idle timeout**: `session-status` mengukur aktivitas di Portal, bukan di aplikasi ini. Pengguna yang hanya bekerja di sini lebih dari 30 menit akan terputus. Matikan dengan `SSO_SESSION_CHECK_ENABLED=false` bila tidak diinginkan.
5. **Logout Portal**: kontrak tidak menyediakan endpoint logout, jadi logout di sini hanya mengakhiri sesi lokal.
