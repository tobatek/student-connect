use crate::http::Response;
use crate::services::crud::{parse_payload, validation_error};
use crate::state::AppState;
use crate::validators::records::validate_tenant;
use serde_json::json;

pub fn show(state: &AppState) -> Response {
    Response::json(
        200,
        json!({
            "status": "ok",
            "data": state.current_tenant()
        })
        .to_string(),
    )
}

pub fn update(body: &str, state: &AppState) -> Response {
    let payload = match parse_payload(body) {
        Ok(payload) => payload,
        Err(error) => return validation_error(&error),
    };
    if let Err(error) = validate_tenant(&payload) {
        return validation_error(&error);
    }

    let tenant = state.replace_tenant(payload);
    Response::json(
        200,
        json!({
            "status": "updated",
            "data": tenant
        })
        .to_string(),
    )
}
