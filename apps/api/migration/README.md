# Migration Plan

Initial database migrations are planned for Fase 2 and Fase 3. Fase 2 starts with:

- tenants, users, sessions, roles, and audit_logs

Fase 3 adds:

- core records: prestasi_mandiri, sertifikasi, rekognisi, kejuaraan, institusi
- enum_mappings

Fase 4 adds:

- documents and document locks

Next migrations:

- simkatmawa_credentials and submission_logs

Production target: PostgreSQL. SQLite can be used only for local development.
