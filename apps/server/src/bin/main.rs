use loco_rs::cli;
use migration::Migrator;
use student_connect::app::App;

#[tokio::main]
async fn main() -> loco_rs::Result<()> {
    cli::main::<App, Migrator>().await
}
