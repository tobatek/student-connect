use crate::config::AppConfig;
use crate::http::{escape_json, Request, Response};
use crate::middleware::rbac::AuthContext;
use crate::models::document::Document;
use crate::services::crud::{parse_payload, validation_error};
use crate::services::r2_storage::{build_object_key, public_url};
use crate::state::AppState;
use crate::validators::upload::validate_upload;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static DOCUMENT_COUNTER: AtomicU64 = AtomicU64::new(1);

pub fn list(request: &Request, state: &AppState) -> Response {
    let page = request.query_u64("page", 1, 1, 10_000);
    let limit = request.query_u64("limit", 20, 1, 100);
    let (documents, total) = state.list_documents(page, limit);
    let documents: Vec<Value> = documents
        .into_iter()
        .map(|document| document.to_json())
        .collect();

    Response::json(
        200,
        json!({
            "status": "ok",
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total
            },
            "data": documents
        })
        .to_string(),
    )
}

pub fn upload(
    request: &Request,
    auth: &AuthContext,
    config: &AppConfig,
    state: &AppState,
) -> Response {
    let payload = match parse_payload(&request.body) {
        Ok(payload) => payload,
        Err(error) => return validation_error(&error),
    };
    if let Err(error) = validate_upload(&payload, config.r2.max_upload_mb) {
        return validation_error(&error);
    }

    let original_filename = string_field(&payload, "original_filename");
    let record_type = string_field(&payload, "record_type");
    let record_id = string_field(&payload, "record_id");
    let document_type = string_field(&payload, "document_type");
    let year = payload
        .get("tahun")
        .and_then(Value::as_str)
        .unwrap_or("2026");
    let object_key = build_object_key(
        &auth.tenant_id,
        year,
        &record_type,
        &record_id,
        &document_type,
        &original_filename,
    );

    let document = Document {
        id: format!("doc-{}", DOCUMENT_COUNTER.fetch_add(1, Ordering::SeqCst)),
        tenant_id: auth.tenant_id.clone(),
        original_filename,
        public_url: public_url(&config.r2, &object_key),
        object_key,
        mime_type: string_field(&payload, "mime_type"),
        size_bytes: payload
            .get("size_bytes")
            .and_then(Value::as_u64)
            .unwrap_or_default(),
        checksum: string_field(&payload, "checksum"),
        record_type,
        record_id,
        document_type,
        is_locked: payload
            .get("is_locked")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        created_at: now_epoch_seconds(),
    };

    let document = state.create_document(document);
    Response::json(
        201,
        json!({
            "status": "created",
            "data": document.to_json()
        })
        .to_string(),
    )
}

pub fn show(id: &str, state: &AppState) -> Response {
    match state.get_document(id) {
        Some(document) => Response::json(
            200,
            json!({
                "status": "ok",
                "data": document.to_json()
            })
            .to_string(),
        ),
        None => Response::json(
            404,
            r#"{"status":"error","message":"document not found"}"#.to_string(),
        ),
    }
}

pub fn delete(id: &str, state: &AppState) -> Response {
    match state.delete_document(id) {
        Ok(document) => Response::json(
            200,
            json!({
                "status": "deleted",
                "data": document.to_json()
            })
            .to_string(),
        ),
        Err(error) if error.contains("locked") => Response::json(
            403,
            format!(
                r#"{{"status":"error","message":"{}"}}"#,
                escape_json(&error)
            ),
        ),
        Err(_) => Response::json(
            404,
            r#"{"status":"error","message":"document not found"}"#.to_string(),
        ),
    }
}

fn string_field(payload: &Value, field: &str) -> String {
    payload
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
