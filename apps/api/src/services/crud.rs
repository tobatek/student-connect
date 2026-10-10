use crate::http::{escape_json, Request, Response};
use crate::middleware::rbac::AuthContext;
use crate::models::record::RecordKind;
use crate::state::AppState;
use crate::validators::records::validate_record;
use serde_json::{json, Value};

pub fn list(kind: RecordKind, request: &Request, state: &AppState) -> Response {
    let page = request.query_u64("page", 1, 1, 10_000);
    let limit = request.query_u64("limit", 20, 1, 100);
    let (items, total) = state.list_records(kind, page, limit);
    let items: Vec<Value> = items.into_iter().map(|record| record.to_json()).collect();

    Response::json(
        200,
        json!({
            "status": "ok",
            "entity": kind.entity_name(),
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total
            },
            "data": items
        })
        .to_string(),
    )
}

pub fn get(kind: RecordKind, id: &str, state: &AppState) -> Response {
    match state.get_record(kind, id) {
        Some(record) => Response::json(
            200,
            json!({
                "status": "ok",
                "entity": kind.entity_name(),
                "data": record.to_json()
            })
            .to_string(),
        ),
        None => Response::json(
            404,
            format!(
                r#"{{"status":"error","message":"{} not found"}}"#,
                escape_json(kind.entity_name())
            ),
        ),
    }
}

pub fn create(
    kind: RecordKind,
    request: &Request,
    auth: &AuthContext,
    state: &AppState,
) -> Response {
    let payload = match parse_payload(&request.body) {
        Ok(payload) => payload,
        Err(error) => return validation_error(&error),
    };
    if let Err(error) = validate_record(kind, &payload) {
        return validation_error(&error);
    }

    let record = state.create_record(kind, auth.tenant_id.clone(), payload);
    Response::json(
        201,
        json!({
            "status": "created",
            "entity": kind.entity_name(),
            "data": record.to_json()
        })
        .to_string(),
    )
}

pub fn update(kind: RecordKind, id: &str, request: &Request, state: &AppState) -> Response {
    let payload = match parse_payload(&request.body) {
        Ok(payload) => payload,
        Err(error) => return validation_error(&error),
    };
    if let Err(error) = validate_record(kind, &payload) {
        return validation_error(&error);
    }

    match state.update_record(kind, id, payload) {
        Some(record) => Response::json(
            200,
            json!({
                "status": "updated",
                "entity": kind.entity_name(),
                "data": record.to_json()
            })
            .to_string(),
        ),
        None => Response::json(
            404,
            format!(
                r#"{{"status":"error","message":"{} not found"}}"#,
                escape_json(kind.entity_name())
            ),
        ),
    }
}

pub fn parse_payload(body: &str) -> Result<Value, String> {
    let normalized = body
        .trim_matches('\0')
        .trim()
        .trim_start_matches('\u{feff}');
    let payload: Value =
        serde_json::from_str(normalized).map_err(|_| "invalid JSON body".to_string())?;
    payload
        .as_object()
        .ok_or_else(|| "JSON body must be an object".to_string())?;
    Ok(payload)
}

pub fn validation_error(error: &str) -> Response {
    Response::json(
        400,
        format!(r#"{{"status":"error","message":"{}"}}"#, escape_json(error)),
    )
}
