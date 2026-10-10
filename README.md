# Student Connect

Monorepo pengelolaan prestasi, sertifikasi, rekognisi, dan dokumen kemahasiswaan dengan integrasi SIMKATMAWA.

```text
apps/web          React + Vite (dashboard)
apps/api          Backend Rust (API)
packages/         API client hasil generate
docs/             Rencana teknis dan panduan
```

## Menjalankan

```bash
cp .env.example .env
pnpm install
pnpm dev:web      # http://localhost:3000
pnpm dev:api      # http://127.0.0.1:5150
```

Windows: bila target MSVC gagal (`link.exe` tidak ada), pakai
`cargo +stable-x86_64-pc-windows-gnu ...`.

## Verifikasi

```bash
pnpm lint
pnpm test:api
pnpm build:web
```

Rencana lengkap: `docs/monorepo-loco-backend-plan.md`. Status fase: `docs/agent-handoff-summary.md`.
