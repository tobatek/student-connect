# Student Connect

Monorepo pengelolaan prestasi, sertifikasi, rekognisi, kejuaraan, laporan institusi, dan dokumen bukti kemahasiswaan, terintegrasi dengan SIMKATMAWA (lihat `docs/simkatmawa-api-panduan.md`).

```text
apps/server        Backend Rust — Loco 1.2 (Axum + SeaORM), PostgreSQL, antrean job
apps/web           Frontend React 19 + Vite + Tailwind CSS 4
packages/contracts Enum, label, katalog indikator, dan tipe API yang dipakai bersama
infra/             Dockerfile server dan contoh Caddy (TLS, SPA + reverse proxy /api)
docs/              Arsitektur, pemetaan kontrol ISO/IEC 27001:2022, panduan SIMKATMAWA
design-system/     Token & aturan desain (ui-ux-pro-max)
```

## Mode demo (paling simple, tanpa backend)

```bash
pnpm install
pnpm dev          # http://localhost:3000, data contoh fiktif di browser
```

Akun demo ditampilkan di halaman login (kata sandi `Demo-Sandi-2026!`). Mode ini memakai server tiruan di browser (`apps/web/src/mock`), tidak mengirim apa pun ke SIMKATMAWA, dan tidak ikut ter-bundle di build produksi. Unggah berkas, tambah pengguna, dan ekspor CSV memang tidak tersedia di demo.

## Menjalankan dengan backend Loco (pengembangan)

```bash
cp .env.example .env
docker compose up -d db          # PostgreSQL 17
pnpm install
cd apps/server
cargo loco start --server-and-worker        # API :5150 (+ worker antrean)
# terminal lain, dari root:
pnpm dev:web                      # http://localhost:3000 (proxy /api ke :5150)
```

Buat tenant + akun awal (kata sandi sementara wajib diganti saat login pertama):

```bash
cd apps/server
cargo loco task bootstrap slug:kampus nama_pt:"Nama PT" kode_pt:999999 tahun:2026 \
  email:admin@kampus.ac.id name:"Admin" password:"<sandi-sementara-kuat>"
```

> Windows: Rust butuh linker. Pasang *Visual Studio Build Tools (C++)* atau jalankan build di Docker.

## Verifikasi

```bash
pnpm typecheck && pnpm test:web && pnpm build:web
cd apps/server && cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## Dokumen

- `docs/architecture.md` — arsitektur, model data, alur status, API.
- `docs/security-controls.md` — pemetaan kontrol ke ISO/IEC 27001:2022 Annex A, residual risk, dan checklist produksi.
- Catatan: proyek ini menerapkan kontrol teknis berbasis ISO 27001; sertifikasi tetap memerlukan audit organisasi formal.
