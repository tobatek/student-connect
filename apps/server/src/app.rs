use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use loco_rs::{
    app::{AppContext, Hooks},
    bgworker::{BackgroundWorker, Queue},
    boot::{create_app, BootResult, StartMode},
    config::Config,
    controller::AppRoutes,
    db::truncate_table,
    environment::Environment,
    storage::{
        drivers::{aws, local},
        Storage,
    },
    task::Tasks,
    Error, Result,
};
use migration::Migrator;

use crate::{
    controllers,
    models::_entities::{
        documents, enum_mappings, institusi_reports, kejuaraan, master_employees, master_students,
        records, sessions, simkatmawa_credentials, submission_logs, sync_runs, tenants, users,
    },
    security::vault::Vault,
    settings::Settings,
    tasks,
    workers::{master_sync::MasterSyncWorker, submit_simkatmawa::SubmitSimkatmawaWorker},
};

pub struct App;

#[async_trait]
impl Hooks for App {
    fn app_name() -> &'static str {
        env!("CARGO_CRATE_NAME")
    }

    fn app_version() -> String {
        format!(
            "{} ({})",
            env!("CARGO_PKG_VERSION"),
            option_env!("BUILD_SHA")
                .or(option_env!("GITHUB_SHA"))
                .unwrap_or("dev")
        )
    }

    async fn boot(
        mode: StartMode,
        environment: &Environment,
        config: Config,
    ) -> Result<BootResult> {
        create_app::<Self, Migrator>(mode, environment, config).await
    }

    fn routes(_ctx: &AppContext) -> AppRoutes {
        AppRoutes::with_default_routes() // /_ping, /_health, /_readme
            .add_route(controllers::auth::routes())
            .add_route(controllers::dashboard::routes())
            .add_route(controllers::tenant::routes())
            .add_route(controllers::users::routes())
            .add_route(controllers::records::routes())
            .add_route(controllers::kejuaraan::routes())
            .add_route(controllers::institusi::routes())
            .add_route(controllers::documents::routes())
            .add_route(controllers::documents::public_routes())
            .add_route(controllers::simkatmawa::routes())
            .add_route(controllers::settings::routes())
            .add_route(controllers::logs::routes())
            .add_route(controllers::sso::routes())
            .add_route(controllers::lookups::routes())
            .add_route(controllers::master_sync::routes())
    }

    /// Validasi konfigurasi saat boot (gagal cepat bila rahasia/pengaturan salah), bangun
    /// brankas kredensial dan driver storage. Rahasia hanya datang dari `config/*.yaml`.
    async fn after_context(ctx: AppContext) -> Result<AppContext> {
        let settings = Settings::load(&ctx)?;
        let vault = Vault::from_base64(&settings.credential_master_key)
            .map_err(|e| Error::Message(e.to_string()))?;
        ctx.shared_store.insert(settings.clone());
        ctx.shared_store.insert(Arc::new(vault));

        let storage = &settings.storage;
        let driver = if storage.driver == "r2" {
            aws::with_credentials_and_endpoint(
                &storage.bucket,
                &storage.region,
                &storage.endpoint,
                aws::Credential {
                    key_id: storage.access_key_id.clone(),
                    secret_key: storage.secret_access_key.clone(),
                    token: None,
                },
            )
            .map_err(|e| Error::Message(format!("storage R2 tidak dapat diinisialisasi: {e}")))?
        } else {
            local::new_with_prefix("uploads")
                .map_err(|e| Error::Message(format!("storage lokal tidak dapat diinisialisasi: {e}")))?
        };
        Ok(ctx
            .into_builder()
            .storage(Arc::new(Storage::single(driver)))
            .build())
    }

    async fn connect_workers(ctx: &AppContext, queue: &Queue) -> Result<()> {
        queue.register(SubmitSimkatmawaWorker::build(ctx)).await?;
        queue.register(MasterSyncWorker::build(ctx)).await?;
        Ok(())
    }

    fn register_tasks(tasks: &mut Tasks) {
        tasks.register(tasks::bootstrap::Bootstrap);
        tasks.register(tasks::sessions_purge::SessionsPurge);
        tasks.register(tasks::submissions_recover::SubmissionsRecover);
        tasks.register(tasks::audit_verify::AuditVerify);
        tasks.register(tasks::master_sync::SyncMaster);
        tasks.register(tasks::sso_sessions_check::SsoSessionsCheck);
    }

    /// Hanya untuk test/dev. `audit_logs` sengaja TIDAK dikosongkan (append-only).
    async fn truncate(ctx: &AppContext) -> Result<()> {
        truncate_table(&ctx.db, sync_runs::Entity).await?;
        truncate_table(&ctx.db, master_students::Entity).await?;
        truncate_table(&ctx.db, master_employees::Entity).await?;
        truncate_table(&ctx.db, submission_logs::Entity).await?;
        truncate_table(&ctx.db, documents::Entity).await?;
        truncate_table(&ctx.db, records::Entity).await?;
        truncate_table(&ctx.db, kejuaraan::Entity).await?;
        truncate_table(&ctx.db, institusi_reports::Entity).await?;
        truncate_table(&ctx.db, enum_mappings::Entity).await?;
        truncate_table(&ctx.db, simkatmawa_credentials::Entity).await?;
        truncate_table(&ctx.db, sessions::Entity).await?;
        truncate_table(&ctx.db, users::Entity).await?;
        truncate_table(&ctx.db, tenants::Entity).await?;
        Ok(())
    }

    async fn seed(_ctx: &AppContext, _base: &Path) -> Result<()> {
        Ok(())
    }
}
