mod app;
mod config;
mod controllers;
mod database;
mod http;
mod jobs;
mod middleware;
mod models;
mod services;
mod state;
mod validators;

use crate::config::AppConfig;
use crate::http::{Request, Response};
use crate::state::AppState;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

fn main() -> std::io::Result<()> {
    let config = AppConfig::from_env();
    let state = AppState::default();
    let database = database::DatabaseConnection::from_config(&config.database);
    database.log_startup_status();

    let listener = TcpListener::bind(&config.server.bind_address)?;

    println!(
        "students-connect-api listening on http://{}",
        config.server.bind_address
    );

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => handle_connection(stream, &config, &state),
            Err(error) => eprintln!("connection error: {error}"),
        }
    }

    Ok(())
}

fn handle_connection(mut stream: TcpStream, config: &AppConfig, state: &AppState) {
    let request = match read_http_request(&mut stream) {
        Ok(request) => request,
        Err(error) => {
            eprintln!("read error: {error}");
            return;
        }
    };
    let request = Request::parse(&request);
    let response = app::route(&request, config, state).unwrap_or_else(Response::internal_error);
    let response = response.to_http();

    if let Err(error) = stream.write_all(response.as_bytes()) {
        eprintln!("write error: {error}");
    }
}

fn read_http_request(stream: &mut TcpStream) -> std::io::Result<String> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    let mut bytes = Vec::new();
    let mut buffer = [0; 4096];

    loop {
        let read = stream.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read]);

        if request_is_complete(&bytes) {
            break;
        }
    }

    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn request_is_complete(bytes: &[u8]) -> bool {
    let request = String::from_utf8_lossy(bytes);
    let Some((head, body)) = request.split_once("\r\n\r\n") else {
        return false;
    };
    let content_length = head
        .lines()
        .find_map(|line| line.split_once(':'))
        .filter(|(name, _)| name.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, value)| value.trim().parse::<usize>().ok())
        .unwrap_or(0);

    body.as_bytes().len() >= content_length
}
