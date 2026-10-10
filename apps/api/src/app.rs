use crate::config::AppConfig;
use crate::controllers::{documents, health, session, tenant};
use crate::http::{Request, Response};
use crate::middleware::rbac::{authorize, Role};
use crate::models::record::RecordKind;
use crate::services::audit_log::{AuditAction, AuditLogService};
use crate::services::crud;
use crate::state::AppState;

const ADMIN_ROLES: &[Role] = &[
    Role::SuperAdmin,
    Role::AdminPt,
    Role::AdminKemahasiswaan,
    Role::AdminProdi,
];

pub fn route(request: &Request, config: &AppConfig, state: &AppState) -> Result<Response, String> {
    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/api/health") => Ok(Response::json(200, health::show(config))),
        ("GET", "/api/tenant") => {
            let auth = match authorize(request, &[Role::SuperAdmin, Role::AdminPt]) {
                Ok(auth) => auth,
                Err(error) => return Ok(auth_error_response(&error)),
            };
            AuditLogService::stdout().record(AuditAction::ReadTenant, &auth, None);
            Ok(tenant::show(state))
        }
        ("GET", "/api/session") => {
            let auth = match authorize(request, Role::all()) {
                Ok(auth) => auth,
                Err(error) => return Ok(auth_error_response(&error)),
            };
            Ok(Response::json(200, session::current(&auth)))
        }
        ("PUT", "/api/tenant") => {
            let auth = match authorize(request, &[Role::SuperAdmin, Role::AdminPt]) {
                Ok(auth) => auth,
                Err(error) => return Ok(auth_error_response(&error)),
            };
            AuditLogService::stdout().record(
                AuditAction::UpdateTenant,
                &auth,
                Some(request.body.as_str()),
            );
            Ok(tenant::update(&request.body, state))
        }
        ("GET", "/api/prestasi-mandiri") => {
            list_records(request, state, RecordKind::PrestasiMandiri)
        }
        ("POST", "/api/prestasi-mandiri") => {
            create_record(request, state, RecordKind::PrestasiMandiri)
        }
        ("GET", path) if path.starts_with("/api/prestasi-mandiri/") => get_record(
            request,
            path,
            "/api/prestasi-mandiri/",
            state,
            RecordKind::PrestasiMandiri,
        ),
        ("PUT", path) if path.starts_with("/api/prestasi-mandiri/") => update_record(
            request,
            path,
            "/api/prestasi-mandiri/",
            state,
            RecordKind::PrestasiMandiri,
        ),
        ("GET", "/api/sertifikasi") => list_records(request, state, RecordKind::Sertifikasi),
        ("POST", "/api/sertifikasi") => create_record(request, state, RecordKind::Sertifikasi),
        ("GET", path) if path.starts_with("/api/sertifikasi/") => get_record(
            request,
            path,
            "/api/sertifikasi/",
            state,
            RecordKind::Sertifikasi,
        ),
        ("PUT", path) if path.starts_with("/api/sertifikasi/") => update_record(
            request,
            path,
            "/api/sertifikasi/",
            state,
            RecordKind::Sertifikasi,
        ),
        ("GET", "/api/rekognisi") => list_records(request, state, RecordKind::Rekognisi),
        ("POST", "/api/rekognisi") => create_record(request, state, RecordKind::Rekognisi),
        ("GET", path) if path.starts_with("/api/rekognisi/") => get_record(
            request,
            path,
            "/api/rekognisi/",
            state,
            RecordKind::Rekognisi,
        ),
        ("PUT", path) if path.starts_with("/api/rekognisi/") => update_record(
            request,
            path,
            "/api/rekognisi/",
            state,
            RecordKind::Rekognisi,
        ),
        ("GET", "/api/kejuaraan") => list_records(request, state, RecordKind::Kejuaraan),
        ("POST", "/api/kejuaraan") => create_record(request, state, RecordKind::Kejuaraan),
        ("GET", path) if path.starts_with("/api/kejuaraan/") => get_record(
            request,
            path,
            "/api/kejuaraan/",
            state,
            RecordKind::Kejuaraan,
        ),
        ("PUT", path) if path.starts_with("/api/kejuaraan/") => update_record(
            request,
            path,
            "/api/kejuaraan/",
            state,
            RecordKind::Kejuaraan,
        ),
        ("GET", "/api/institusi") => list_records(request, state, RecordKind::Institusi),
        ("POST", "/api/institusi") => create_record(request, state, RecordKind::Institusi),
        ("GET", path) if path.starts_with("/api/institusi/") => get_record(
            request,
            path,
            "/api/institusi/",
            state,
            RecordKind::Institusi,
        ),
        ("PUT", path) if path.starts_with("/api/institusi/") => update_record(
            request,
            path,
            "/api/institusi/",
            state,
            RecordKind::Institusi,
        ),
        ("GET", "/api/settings/enum-mappings") => {
            list_records(request, state, RecordKind::EnumMapping)
        }
        ("PUT", "/api/settings/enum-mappings") => {
            create_record(request, state, RecordKind::EnumMapping)
        }
        ("GET", "/api/documents") => list_documents(request, state),
        ("POST", "/api/documents/upload") => upload_document(request, config, state),
        ("GET", path) if path.starts_with("/api/documents/") => show_document(request, path, state),
        ("DELETE", path) if path.starts_with("/api/documents/") => {
            delete_document(request, path, state)
        }
        _ => Ok(not_found()),
    }
}

fn list_records(request: &Request, state: &AppState, kind: RecordKind) -> Result<Response, String> {
    match authorize(request, Role::all()) {
        Ok(_) => Ok(crud::list(kind, request, state)),
        Err(error) => Ok(auth_error_response(&error)),
    }
}

fn create_record(
    request: &Request,
    state: &AppState,
    kind: RecordKind,
) -> Result<Response, String> {
    let auth = match authorize(request, ADMIN_ROLES) {
        Ok(auth) => auth,
        Err(error) => return Ok(auth_error_response(&error)),
    };
    Ok(crud::create(kind, request, &auth, state))
}

fn get_record(
    request: &Request,
    path: &str,
    prefix: &str,
    state: &AppState,
    kind: RecordKind,
) -> Result<Response, String> {
    if let Err(error) = authorize(request, Role::all()) {
        return Ok(auth_error_response(&error));
    }
    let id = path.trim_start_matches(prefix);
    if id.is_empty() {
        return Ok(not_found());
    }
    Ok(crud::get(kind, id, state))
}

fn update_record(
    request: &Request,
    path: &str,
    prefix: &str,
    state: &AppState,
    kind: RecordKind,
) -> Result<Response, String> {
    let auth = match authorize(request, ADMIN_ROLES) {
        Ok(auth) => auth,
        Err(error) => return Ok(auth_error_response(&error)),
    };
    let id = path.trim_start_matches(prefix);
    if id.is_empty() {
        return Ok(not_found());
    }
    AuditLogService::stdout().record(AuditAction::UpdateEnumMapping, &auth, Some(&request.body));
    Ok(crud::update(kind, id, request, state))
}

fn list_documents(request: &Request, state: &AppState) -> Result<Response, String> {
    match authorize(request, Role::all()) {
        Ok(_) => Ok(documents::list(request, state)),
        Err(error) => Ok(auth_error_response(&error)),
    }
}

fn upload_document(
    request: &Request,
    config: &AppConfig,
    state: &AppState,
) -> Result<Response, String> {
    let auth = match authorize(request, ADMIN_ROLES) {
        Ok(auth) => auth,
        Err(error) => return Ok(auth_error_response(&error)),
    };
    AuditLogService::stdout().record(AuditAction::UploadDocument, &auth, Some(&request.body));
    Ok(documents::upload(request, &auth, config, state))
}

fn show_document(request: &Request, path: &str, state: &AppState) -> Result<Response, String> {
    if let Err(error) = authorize(request, Role::all()) {
        return Ok(auth_error_response(&error));
    }
    let id = path.trim_start_matches("/api/documents/");
    if id.is_empty() {
        return Ok(not_found());
    }
    Ok(documents::show(id, state))
}

fn delete_document(request: &Request, path: &str, state: &AppState) -> Result<Response, String> {
    let auth = match authorize(request, ADMIN_ROLES) {
        Ok(auth) => auth,
        Err(error) => return Ok(auth_error_response(&error)),
    };
    let id = path.trim_start_matches("/api/documents/");
    if id.is_empty() {
        return Ok(not_found());
    }
    AuditLogService::stdout().record(AuditAction::DeleteDocument, &auth, None);
    Ok(documents::delete(id, state))
}

fn not_found() -> Response {
    Response::json(
        404,
        r#"{"status":"error","message":"not found"}"#.to_string(),
    )
}

fn auth_error_response(error: &str) -> Response {
    let status = if error.contains("not allowed") {
        403
    } else {
        401
    };
    Response::json(
        status,
        format!(
            r#"{{"status":"error","message":"{}"}}"#,
            crate::http::escape_json(error)
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_is_public() {
        let config = AppConfig::from_env();
        let state = AppState::default();
        let request = Request::parse("GET /api/health HTTP/1.1\r\n\r\n");
        let response = route(&request, &config, &state).expect("health should route");

        assert_eq!(response.status_code, 200);
    }

    #[test]
    fn tenant_requires_allowed_role() {
        let config = AppConfig::from_env();
        let state = AppState::default();
        let request = Request::parse("GET /api/tenant HTTP/1.1\r\n\r\n");
        let response = route(&request, &config, &state).expect("tenant route should respond");

        assert_eq!(response.status_code, 401);
        assert!(response.body.contains("missing auth"));
    }

    #[test]
    fn session_accepts_known_role() {
        let config = AppConfig::from_env();
        let state = AppState::default();
        let request = Request::parse(
            "GET /api/session HTTP/1.1\r\nx-user-id: u-1\r\nx-tenant-id: t-1\r\nx-user-role: AUDITOR\r\n\r\n",
        );
        let response = route(&request, &config, &state).expect("session route should respond");

        assert_eq!(response.status_code, 200);
        assert!(response.body.contains("AUDITOR"));
    }

    #[test]
    fn prestasi_mandiri_validates_required_fields() {
        let config = AppConfig::from_env();
        let state = AppState::default();
        let request = Request::parse(
            "POST /api/prestasi-mandiri HTTP/1.1\r\nx-user-id: u-1\r\nx-tenant-id: t-1\r\nx-user-role: ADMIN_PT\r\n\r\n{}",
        );
        let response = route(&request, &config, &state).expect("crud route should respond");

        assert_eq!(response.status_code, 400);
        assert!(response.body.contains("lomba is required"));
    }

    #[test]
    fn prestasi_mandiri_create_and_list_are_paginated() {
        let config = AppConfig::from_env();
        let state = AppState::default();
        let body = r#"{"lomba":"Hackathon","level":"NAS","kategori":"RISNOV","peringkat":"JUARA1","mahasiswa":[{"nim":"1","nama":"A"}]}"#;
        let request = Request::parse(&format!(
            "POST /api/prestasi-mandiri HTTP/1.1\r\nx-user-id: u-1\r\nx-tenant-id: t-1\r\nx-user-role: ADMIN_PT\r\n\r\n{body}",
        ));
        let response = route(&request, &config, &state).expect("create should respond");
        assert_eq!(response.status_code, 201);

        let list = Request::parse(
            "GET /api/prestasi-mandiri?page=1&limit=10 HTTP/1.1\r\nx-user-id: u-1\r\nx-tenant-id: t-1\r\nx-user-role: AUDITOR\r\n\r\n",
        );
        let response = route(&list, &config, &state).expect("list should respond");

        assert_eq!(response.status_code, 200);
        assert!(response.body.contains(r#""total":1"#));
    }

    #[test]
    fn document_upload_validates_mime_type() {
        let config = AppConfig::from_env();
        let state = AppState::default();
        let request = Request::parse(
            "POST /api/documents/upload HTTP/1.1\r\nx-user-id: u-1\r\nx-tenant-id: ameta\r\nx-user-role: ADMIN_PT\r\n\r\n{\"original_filename\":\"proof.exe\",\"mime_type\":\"application/octet-stream\",\"size_bytes\":10,\"checksum\":\"abc\",\"record_type\":\"prestasi-mandiri\",\"record_id\":\"pm-1\",\"document_type\":\"sertifikat\"}",
        );
        let response = route(&request, &config, &state).expect("upload should respond");

        assert_eq!(response.status_code, 400);
        assert!(response.body.contains("mime_type must be"));
    }

    #[test]
    fn document_upload_generates_public_url() {
        let config = AppConfig::from_env();
        let state = AppState::default();
        let request = Request::parse(
            "POST /api/documents/upload HTTP/1.1\r\nx-user-id: u-1\r\nx-tenant-id: ameta\r\nx-user-role: ADMIN_PT\r\n\r\n{\"original_filename\":\"sertifikat.pdf\",\"mime_type\":\"application/pdf\",\"size_bytes\":10,\"checksum\":\"abc\",\"record_type\":\"prestasi-mandiri\",\"record_id\":\"pm-1\",\"document_type\":\"sertifikat\"}",
        );
        let response = route(&request, &config, &state).expect("upload should respond");

        assert_eq!(response.status_code, 201);
        assert!(response
            .body
            .contains("https://dokumen.example.ac.id/tenants/ameta/"));
        assert!(response.body.contains("\"is_locked\":false"));
    }
}
