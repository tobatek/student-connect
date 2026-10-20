#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;

mod m20261015_000001_identity;
mod m20261015_000002_records;
mod m20261015_000003_integration_and_audit;
mod m20261016_000004_portal_sso_master;
mod m20261021_000005_sync_progress;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20261015_000001_identity::Migration),
            Box::new(m20261015_000002_records::Migration),
            Box::new(m20261015_000003_integration_and_audit::Migration),
            Box::new(m20261016_000004_portal_sso_master::Migration),
            Box::new(m20261021_000005_sync_progress::Migration),
            // inject-above (do not remove this comment)
        ]
    }
}
