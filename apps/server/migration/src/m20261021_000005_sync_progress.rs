use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// Total baris yang diharapkan per run sinkronisasi (bila diketahui) untuk bar progres di Pengaturan.
const UP: &str = r"
ALTER TABLE sync_runs ADD COLUMN progress_total INTEGER CHECK (progress_total IS NULL OR progress_total >= 0);
";

const DOWN: &str = r"
ALTER TABLE sync_runs DROP COLUMN IF EXISTS progress_total;
";

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection().execute_unprepared(UP).await?;
        Ok(())
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        m.get_connection().execute_unprepared(DOWN).await?;
        Ok(())
    }
}
