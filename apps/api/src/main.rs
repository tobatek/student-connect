mod app;
mod config;
mod controllers;
mod database;
mod http;
mod jobs;
mod middleware;
mod models;
mod server;
mod services;
mod state;
mod validators;

use crate::config::AppConfig;
use crate::state::AppState;
use std::net::TcpListener;
use std::process::ExitCode;
use std::sync::Arc;

fn main() -> ExitCode {
    let config = AppConfig::from_env();

    if config.is_production() {
        let errors = config.production_errors();
        if !errors.is_empty() {
            eprintln!("refusing to start in production:");
            for error in errors {
                eprintln!("  - {error}");
            }
            return ExitCode::FAILURE;
        }
    } else {
        eprintln!(
            "warning: {} mode uses header-based auth (x-user-id/x-tenant-id/x-user-role); development only",
            config.server.app_env
        );
    }

    let database = database::DatabaseConnection::from_config(&config.database);
    database.log_startup_status();

    let listener = match TcpListener::bind(&config.server.bind_address) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("cannot bind {}: {error}", config.server.bind_address);
            return ExitCode::FAILURE;
        }
    };
    println!(
        "students-connect-api listening on http://{}",
        config.server.bind_address
    );

    server::serve(listener, Arc::new(config), Arc::new(AppState::default()));
    ExitCode::SUCCESS
}
