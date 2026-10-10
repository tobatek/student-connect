use crate::http::{escape_json, Request, Response};
use crate::middleware::rbac::AuthContext;
use crate::models::record::RecordKind;
use crate::services::audit_log::{AuditAction, AuditLogService};
use crate::state::{AppState, UpdateError};
use crate::validators::records::validate_record;
use serde_json::{json, Value};

pub fn list(kind: RecordKind, request: &Request, auth: &AuthContext, state: &AppState) -> Response {
    let page = request.query_u64("page", 1, 1, 10_000);
    let limit = request.query_u64("limit", 20, 1, 100);
    let (items, total) = state.list_records(kind, &auth.tenant_id, page, limit);
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

pub fn get(kind: RecordKind, id: &str, auth: &AuthContext, state: &AppState) -> Response {
    match state.get_record(kind, &auth.tenant_id, id) {
        Some(record) => Response::json(
            200,
            json!({
                "status": "ok",
                "entity": kind.entity_name(),
                "data": record.to_json()
            })
            .to_string(),
        ),
        None => not_found(kind),
    }
}

pub fn create(
    kind: RecordKind,
    request: &Request,
    auth: &AuthContext,
    state: &AppState,
) -> Response {
    let payload = match parse_valid_payload(kind, &request.body) {
        Ok(payload) => payload,
        Err(response) => return response,
    };

    let record = state.create_record(kind, &auth.tenant_id, &auth.user_id, payload);
    AuditLogService::stdout().record_entity(
        AuditAction::CreateRecord,
        auth,
        kind.entity_name(),
        &record.id,
    );
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

pub fn update(
    kind: RecordKind,
    id: &str,
    request: &Request,
    auth: &AuthContext,
    state: &AppState,
) -> Response {
    let payload = match parse_valid_payload(kind, &request.body) {
        Ok(payload) => payload,
        Err(response) => return response,
    };

    match state.update_record(kind, &auth.tenant_id, id, payload) {
        Ok(record) => {
            AuditLogService::stdout().record_entity(
                AuditAction::UpdateRecord,
                auth,
                kind.entity_name(),
                &record.id,
            );
            Response::json(
                200,
                json!({
                    "status": "updated",
                    "entity": kind.entity_name(),
                    "data": record.to_json()
                })
                .to_string(),
            )
        }
        Err(UpdateError::NotFound) => not_found(kind),
        Err(UpdateError::Locked) => Response::json(
            409,
            r#"{"status":"error","message":"record is locked and cannot be edited"}"#.to_string(),
        ),
    }
}

/// `PUT /api/settings/enum-mappings`: one mapping per `(category, internal_code)`.
pub fn upsert_enum_mapping(request: &Request, auth: &AuthContext, state: &AppState) -> Response {
    let kind = RecordKind::EnumMapping;
    let payload = match parse_valid_payload(kind, &request.body) {
        Ok(payload) => payload,
        Err(response) => return response,
    };

    let (record, created) = state.upsert_enum_mapping(&auth.tenant_id, &auth.user_id, payload);
    AuditLogService::stdout().record_entity(
        AuditAction::UpdateEnumMapping,
        auth,
        kind.entity_name(),
        &record.id,
    );
    Response::json(
        if created { 201 } else { 200 },
        json!({
            "status": if created { "created" } else { "updated" },
            "entity": kind.entity_name(),
            "data": record.to_json()
        })
        .to_string(),
    )
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

fn parse_valid_payload(kind: RecordKind, body: &str) -> Result<Value, Response> {
    let payload = parse_payload(body).map_err(|error| validation_error(&error))?;
    validate_record(kind, &payload).map_err(|error| validation_error(&error))?;
    Ok(payload)
}

fn not_found(kind: RecordKind) -> Response {
    Response::json(
        404,
        format!(
            r#"{{"status":"error","message":"{} not found"}}"#,
            escape_json(kind.entity_name())
        ),
    )
}
