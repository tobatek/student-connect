//! Uji kontrak klien Portal terhadap Portal tiruan di proses yang sama (tanpa database).

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc,
    },
};

use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};

use super::portal::{Client, MasterKind, PortalError};
use crate::{
    security::sso_crypto::{Envelope, EnvelopeKey},
    settings::{MasterSyncSettings, SsoSettings},
};

const TOKEN: &str = "token-aplikasi-uji-0123456789-abcdefghijklmnop";

#[derive(Clone)]
struct Mock {
    /// Kunci yang dipakai Portal tiruan membalas; dibuat berbeda untuk menguji balasan palsu.
    reply_key: Arc<EnvelopeKey>,
    open_key: Arc<EnvelopeKey>,
    master_calls: Arc<AtomicU32>,
}

fn bearer_ok(h: &HeaderMap) -> bool {
    h.get("authorization").and_then(|v| v.to_str().ok()) == Some(&format!("Bearer {TOKEN}"))
}

async fn verify(State(m): State<Mock>, h: HeaderMap, Json(env): Json<Envelope>) -> Result<Json<Envelope>, StatusCode> {
    if !bearer_ok(&h) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let plain = m.open_key.open(&env).map_err(|_| StatusCode::UNAUTHORIZED)?;
    let req: Value = serde_json::from_slice(&plain).map_err(|_| StatusCode::BAD_REQUEST)?;
    // Kontrak Tahap 1: payload membawa nonce + timestamp untuk proteksi replay.
    assert!(req["nonce"].as_str().is_some_and(|n| n.len() >= 32));
    assert!(req["timestamp"].as_i64().is_some_and(|t| t > 1_700_000_000));
    if req["code"] != "good-code" {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let identity = json!({
        "id": "6f1c3b0e-8a52-4c1e-9d55-1d2f6a9b7c10", "email": "Siti@Kampus.AC.ID", "name": "Siti Aminah",
        "type": "student", "nim": "2201001", "roles": ["mahasiswa"],
    });
    Ok(Json(m.reply_key.seal(identity.to_string().as_bytes()).unwrap()))
}

async fn session_status(State(m): State<Mock>, h: HeaderMap, Json(env): Json<Envelope>) -> Result<Json<Envelope>, StatusCode> {
    if !bearer_ok(&h) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let plain = m.open_key.open(&env).map_err(|_| StatusCode::UNAUTHORIZED)?;
    let req: Value = serde_json::from_slice(&plain).unwrap();
    let active = req["email"] == "aktif@kampus.ac.id";
    let body = json!({"active": active, "idle_timeout_minutes": 30}).to_string();
    Ok(Json(m.reply_key.seal(body.as_bytes()).unwrap()))
}

async fn students(State(m): State<Mock>, h: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Result<Json<Value>, StatusCode> {
    if !bearer_ok(&h) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    // Panggilan pertama gagal sementara: klien harus mencoba lagi dengan backoff.
    if m.master_calls.fetch_add(1, Ordering::SeqCst) == 0 {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }
    assert_eq!(q.get("per_page").map(String::as_str), Some("2"));
    let page: u64 = q.get("page").and_then(|p| p.parse().ok()).unwrap_or(1);
    let rows: Vec<Value> = match page {
        1 => vec![json!({"nim": "1", "nama": "A"}), json!({"nim": "2", "nama": "B"})],
        2 => vec![json!({"nim": "3", "nama": "C"})],
        _ => vec![],
    };
    Ok(Json(json!({"data": rows, "meta": {"current_page": page, "last_page": 2}})))
}

async fn spawn(reply_key_token: &str) -> (SsoSettings, Mock) {
    let mock = Mock {
        reply_key: Arc::new(EnvelopeKey::from_app_token(reply_key_token)),
        open_key: Arc::new(EnvelopeKey::from_app_token(TOKEN)),
        master_calls: Arc::new(AtomicU32::new(0)),
    };
    let app = Router::new()
        .route("/api/sso/verify", post(verify))
        .route("/api/sso/session-status", post(session_status))
        .route("/api/master/students", get(students))
        .with_state(mock.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let settings = SsoSettings {
        enabled: true,
        portal_base_url: format!("http://127.0.0.1:{port}"),
        app_token: TOKEN.to_string(),
        allow_insecure_dev: true,
        timeout_seconds: 5,
        ..SsoSettings::default()
    };
    (settings, mock)
}

#[tokio::test]
async fn verify_exchanges_code_for_identity() {
    let (settings, _) = spawn(TOKEN).await;
    let client = Client::new(&settings).unwrap();
    let id = client.verify("good-code").await.unwrap();
    assert_eq!(id.kind, "student");
    assert_eq!(id.nim.as_deref(), Some("2201001"));
    assert_eq!(id.roles, vec!["mahasiswa"]);
}

#[tokio::test]
async fn verify_maps_bad_code_and_bad_token() {
    let (settings, _) = spawn(TOKEN).await;
    let client = Client::new(&settings).unwrap();
    assert!(matches!(client.verify("expired").await, Err(PortalError::InvalidCode)));

    let wrong = SsoSettings { app_token: "token-lain-0123456789-abcdefghijklmnopqrs".into(), ..settings };
    assert!(matches!(Client::new(&wrong).unwrap().verify("good-code").await, Err(PortalError::Auth)));
}

/// Balasan yang dienkripsi dengan kunci lain (dipalsukan) harus ditolak, bukan dipercaya.
#[tokio::test]
async fn forged_reply_is_rejected() {
    let (settings, _) = spawn("kunci-penyerang-0123456789-abcdefghijklmnop").await;
    let client = Client::new(&settings).unwrap();
    assert!(matches!(client.verify("good-code").await, Err(PortalError::Auth)));
}

#[tokio::test]
async fn session_status_reports_activity() {
    let (settings, _) = spawn(TOKEN).await;
    let client = Client::new(&settings).unwrap();
    assert!(client.session_active("aktif@kampus.ac.id").await.unwrap());
    assert!(!client.session_active("idle@kampus.ac.id").await.unwrap());
}

#[tokio::test]
async fn master_pages_retry_then_paginate_to_the_end() {
    let (settings, mock) = spawn(TOKEN).await;
    let client = Client::new(&settings).unwrap();
    let sync = MasterSyncSettings { page_size: 2, base_backoff_ms: 5, max_attempts: 3, ..MasterSyncSettings::default() };

    let p1 = client.master_page(MasterKind::Students, 1, &sync, None).await.unwrap();
    assert_eq!(p1.rows.len(), 2);
    assert!(p1.has_more);
    assert_eq!(mock.master_calls.load(Ordering::SeqCst), 2, "1 gagal + 1 berhasil");

    let p2 = client.master_page(MasterKind::Students, 2, &sync, None).await.unwrap();
    assert_eq!(p2.rows.len(), 1);
    assert!(!p2.has_more);
}

#[tokio::test]
async fn master_gives_up_after_max_attempts() {
    let (settings, mock) = spawn(TOKEN).await;
    let client = Client::new(&settings).unwrap();
    let sync = MasterSyncSettings { page_size: 2, base_backoff_ms: 1, max_attempts: 1, ..MasterSyncSettings::default() };
    let result = client.master_page(MasterKind::Students, 1, &sync, None).await;
    assert!(matches!(result, Err(PortalError::Transient(_))));
    assert_eq!(mock.master_calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn production_client_refuses_plain_http_and_unlisted_hosts() {
    let base = SsoSettings {
        enabled: true,
        portal_base_url: "http://portal.kampus.ac.id".into(),
        allowed_hosts: vec!["portal.kampus.ac.id".into()],
        app_token: TOKEN.into(),
        ..SsoSettings::default()
    };
    assert!(Client::new(&base).is_err(), "http ditolak");
    let other = SsoSettings { portal_base_url: "https://evil.example.com".into(), ..base };
    assert!(Client::new(&other).is_err(), "host di luar allowlist ditolak");
}
