# Pemetaan kontrol keamanan — ISO/IEC 27001:2022 Annex A

Ini kontrol **teknis aplikasi**, bukan klaim sertifikasi. Sertifikasi memerlukan ISMS organisasi dan audit pihak ketiga.

| Kontrol | Implementasi | Lokasi |
|---|---|---|
| A.5.15 Kontrol akses | RBAC default-deny, 7 peran, matriks izin; `Principal` sebagai extractor wajib di setiap endpoint terlindungi; mahasiswa hanya melihat data miliknya | `security/roles.rs`, `security/principal.rs` |
| A.5.16/18 Identitas & hak akses | Tanpa pendaftaran mandiri; hanya SUPER_ADMIN yang boleh mengelola SUPER_ADMIN; ubah peran/nonaktif mencabut sesi | `controllers/users.rs` |
| A.5.17 / A.8.5 Autentikasi | Argon2id; kebijakan sandi 12+ & 4 kelas; kunci akun 5 gagal/15 menit; pesan galat seragam + penyetaraan waktu; rate limit IP & email; sandi sementara wajib diganti | `controllers/auth.rs`, `security/password.rs`, `models/users.rs` |
| A.8.5 Sesi | Token acak 48 karakter, hanya hash SHA-256 di DB, cookie HttpOnly+Secure+SameSite=Strict (`__Host-`), idle 30 menit, absolut 8 jam, maks 5 sesi, cabut sisi-server, sesi baru tiap login | `models/sessions.rs` |
| A.8.26 CSRF/XSS | Token CSRF sinkron per sesi (compare waktu-konstan); JSON-only; React meng-escape; `href` hanya http(s); CSP `default-src 'none'` di API | `security/principal.rs`, `config/*.yaml`, `apps/web/src/lib/format.ts` |
| A.8.24 Kriptografi | Kredensial SIMKATMAWA dienkripsi AES-256-GCM, nonce acak, AAD terikat tenant; kunci master dari env/secret manager; TLS di proxy; HSTS | `security/vault.rs`, `models/simkatmawa_credentials.rs` |
| A.8.11/A.8.12 Perlindungan data | Respons lewat DTO (tak ada hash/token); log & audit disensor otomatis; password/token tak pernah dikirim balik ke browser | `views/`, `security/mask.rs` |
| A.8.15 Logging | `audit_logs` append-only (trigger Postgres) dengan hash berantai; verifikasi via `/audit-logs/verify` & task `audit:verify` terjadwal; penulisan gagal-tertutup | `models/audit_logs.rs`, migrasi 003 |
| A.8.16 Pemantauan | Log terstruktur (JSON di produksi), request-id, log pengiriman per percobaan | `config/production.yaml` |
| A.8.20/21 Jaringan & layanan | Anti-SSRF: https + allowlist host, IP ditolak, tanpa redirect, timeout, batas ukuran respons; CORS ketat; header keamanan | `security/url_guard.rs`, `integrations/simkatmawa.rs` |
| A.8.28 Secure coding | Validasi ketat sisi-server per jenis; `deny_unknown_fields` (anti mass-assignment); SeaORM berparameter (tanpa SQL rakitan); CHECK constraint DB; ekspor CSV anti formula-injection; optimistic locking | `models/records.rs`, `security/csv.rs` |
| A.8.26 Unggah file | Tipe dari magic bytes (PDF/JPG/PNG), batas ukuran, nama objek UUID acak, tanpa overwrite, nama file disanitasi (anti traversal), SHA-256, dokumen terkirim terkunci (app + trigger) | `controllers/documents.rs`, `security/sniff.rs`, `models/documents.rs` |
| A.5.23/8.9 Konfigurasi | Rahasia hanya via `config/*.yaml` + env; produksi menolak boot tanpa rahasia/https/R2; validasi `Settings` saat boot | `settings.rs`, `config/production.yaml` |
| A.8.13 Backup | (Prosedural) backup Postgres terjadwal + versioning R2; uji restore berkala | lihat checklist |
| A.8.6 Kapasitas | Pagination wajib (maks 100), batas body 1 MB (unggah 17 MB), timeout request, job di luar request | `views/mod.rs`, config |

## Residual risk / keterbatasan

* Rate limit dalam memori per-instance (cukup untuk 1 instance; pindah ke cache bersama bila scale-out).
* Tidak ada pemindaian antivirus pada unggahan; pertimbangkan ClamAV untuk produksi.
* SSO Portal tersedia (opsional, lihat docs/sso-portal-integrasi.md); MFA mengikuti kebijakan Portal. Login sandi lokal tetap hidup sampai dimatikan lewat SSO_PASSWORD_LOGIN_ENABLED.
* Dokumen R2 berstatus publik-baca permanen **sesuai kebutuhan SIMKATMAWA**; jangan unggah dokumen yang berisi data pribadi sensitif yang tidak perlu dikirim.
* Rotasi `CREDENTIAL_MASTER_KEY` memerlukan re-enkripsi (kolom `key_version` sudah disiapkan).
* Kode ini **belum dikompilasi/dijalankan** di lingkungan pengembangan saat ditulis (lihat README): jalankan `cargo test` dan lakukan review keamanan independen sebelum produksi.

## Checklist produksi

- [ ] `CREDENTIAL_MASTER_KEY` dibuat dengan `openssl rand -base64 32`, disimpan di secret manager.
- [ ] TLS di Caddy/Nginx; `X-Forwarded-For` hanya dari proxy tepercaya; port 5150 tidak terbuka publik.
- [ ] Bucket R2: public read hanya prefix `tenants/`, tanpa listing; kredensial R2 minimum-privilege.
- [ ] `DB_AUTO_MIGRATE=false` bila >1 instance; migrasi sebagai langkah rilis.
- [ ] Jalankan worker: `cargo loco start --server-and-worker` (atau proses worker terpisah) dan scheduler (`cargo loco scheduler`).
- [ ] Backup Postgres + uji restore; retensi `audit_logs` sesuai kebijakan.
- [ ] `cargo audit` dan `pnpm audit` rutin; review kode modul kredensial, unggah, ekspor, dan kirim.
