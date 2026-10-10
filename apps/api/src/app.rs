use crate::config::AppConfig;
use crate::controllers::{documents, health, session, tenant};
use crate::http::{Request, Response};
use crate::middleware::rbac::{authorize, AuthContext, AuthError, Role};
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
const SETTINGS_ROLES: &[Role] = &[Role::SuperAdmin, Role::AdminPt];

const RECORD_ROUTES: &[(&str, RecordKind)] = &[
    ("/api/prestasi-mandiri", RecordKind::PrestasiMandiri),
    ("/api/sertifikasi", RecordKind::Sertifikasi),
    ("/api/rekognisi", RecordKind::Rekognisi),
    ("/api/kejuaraan", RecordKind::Kejuaraan),
    ("/api/institusi", RecordKind::Institusi),
];

pub fn route(request: &Request, config: &AppConfig, state: &AppState) -> Result<Response, String> {
    let method = request.method.as_str();
    let path = request.path.as_str();

    let response = match (method, path) {
        ("GET", "/api/health") => Response::json(200, health::show(config)),
        ("GET", "/api/session") => guarded(request, Role::all(), |auth| {
            Response::json(200, session::current(&auth))
        }),
        ("GET", "/api/tenant") => guarded(request, SETTINGS_ROLES, |auth| {
            AuditLogService::stdout().record(AuditAction::ReadTenant, &auth, None);
            tenant::show(&auth, state)
        }),
        ("PUT", "/api/tenant") => guarded(request, SETTINGS_ROLES, |auth| {
            AuditLogService::stdout().record(
                AuditAction::UpdateTenant,
                &auth,
                Some(request.body.as_str()),
            );
            tenant::update(&request.body, &auth, state)
        }),
        ("GET", "/api/settings/enum-mappings") => guarded(request, Role::all(), |auth| {
            crud::list(RecordKind::EnumMapping, request, &auth, state)
        }),
        ("PUT", "/api/settings/enum-mappings") => guarded(request, SETTINGS_ROLES, |auth| {
            crud::upsert_enum_mapping(request, &auth, state)
        }),
        ("GET", "/api/documents") => guarded(request, Role::all(), |auth| {
            documents::list(request, &auth, state)
        }),
        ("POST", "/api/documents/upload") => guarded(request, ADMIN_ROLES, |auth| {
            AuditLogService::stdout().record(
                AuditAction::UploadDocument,
                &auth,
                Some(request.body.as_str()),
            );
            documents::upload(request, &auth, config, state)
        }),
        ("GET", _) if document_id(path).is_some() => guarded(request, Role::all(), |auth| {
            documents::show(document_id(path).unwrap_or_default(), &auth, state)
        }),
        ("DELETE", _) if document_id(path).is_some() => guarded(request, ADMIN_ROLES, |auth| {
            AuditLogService::stdout().record(AuditAction::DeleteDocument, &auth, None);
            documents::delete(document_id(path).unwrap_or_default(), &auth, state)
        }),
        _ => match resolve_record_route(path) {
            Some((kind, None)) => match method {
                "GET" => guarded(request, Role::all(), |auth| {
                    crud::list(kind, request, &auth, state)
                }),
                "POST" => guarded(request, ADMIN_ROLES, |auth| {
                    crud::create(kind, request, &auth, state)
                }),
                _ => not_found(),
            },
            Some((kind, Some(id))) => match method {
                "GET" => guarded(request, Role::all(), |auth| {
                    crud::get(kind, id, &auth, state)
                }),
                "PUT" => guarded(request, ADMIN_ROLES, |auth| {
                    crud::update(kind, id, request, &auth, state)
                }),
                _ => not_found(),
            },
            None => not_found(),
        },
    };

    Ok(response)
}

/// Authenticates the request, then runs `handler` only if the role is allowed.
fn guarded(
    request: &Request,
    allowed_roles: &[Role],
    handler: impl FnOnce(AuthContext) -> Response,
) -> Response {
    match authorize(request, allowed_roles) {
        Ok(auth) => handler(auth),
        Err(error) => auth_error_response(&error),
    }
}

fn resolve_record_route(path: &str) -> Option<(RecordKind, Option<&str>)> {
    RECORD_ROUTES.iter().find_map(|(base, kind)| {
        if path == *base {
            return Some((*kind, None));
        }
        let id = path.strip_prefix(base)?.strip_prefix('/')?;
        (!id.is_empty() && !id.contains('/')).then_some((*kind, Some(id)))
    })
}

fn document_id(path: &str) -> Option<&str> {
    let id = path.strip_prefix("/api/documents/")?;
    (!id.is_empty() && !id.contains('/') && id != "upload").then_some(id)
}

fn not_found() -> Response {
    Response::json(
        404,
        r#"{"status":"error","message":"not found"}"#.to_string(),
    )
}

fn auth_error_response(error: &AuthError) -> Response {
    Response::json(
        error.status_code(),
        format!(
            r#"{{"status":"error","message":"{}"}}"#,
            crate::http::escape_json(&error.message())
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRESTASI: &str = r#"{"lomba":"Hackathon","level":"NAS","kategori":"RISNOV","peringkat":"JUARA1","mahasiswa":[{"nim":"1","nama":"A"}]}"#;

    fn call(
        method: &str,
        path: &str,
        tenant: &str,
        role: &str,
        body: &str,
        state: &AppState,
    ) -> Response {
        let request = Request::parse(&format!(
            "{method} {path} HTTP/1.1\r\nx-user-id: u-1\r\nx-tenant-id: {tenant}\r\nx-user-role: {role}\r\n\r\n{body}",
        ));
        route(&request, &AppConfig::from_env(), state).expect("route should respond")
    }

    fn created_id(response: &Response) -> String {
        let body: serde_json::Value = serde_json::from_str(&response.body).expect("json body");
        body["data"]["id"].as_str().expect("id").to_string()
    }

    #[test]
    fn health_is_public() {
        let request = Request::parse("GET /api/health HTTP/1.1\r\n\r\n");
        let response = route(&request, &AppConfig::from_env(), &AppState::default())
            .expect("health should route");

        assert_eq!(response.status_code, 200);
    }

    #[test]
    fn tenant_requires_authentication_and_allowed_role() {
        let state = AppState::default();
        let request = Request::parse("GET /api/tenant HTTP/1.1\r\n\r\n");
        let response = route(&request, &AppConfig::from_env(), &state).expect("respond");
        assert_eq!(response.status_code, 401);
        assert!(response.body.contains("missing auth"));

        let response = call("GET", "/api/tenant", "t-1", "MAHASISWA", "", &state);
        assert_eq!(response.status_code, 403);
    }

    #[test]
    fn session_accepts_known_role() {
        let response = call(
            "GET",
            "/api/session",
            "t-1",
            "AUDITOR",
            "",
            &AppState::default(),
        );

        assert_eq!(response.status_code, 200);
        assert!(response.body.contains("AUDITOR"));
    }

    #[test]
    fn prestasi_mandiri_validates_required_fields() {
        let response = call(
            "POST",
            "/api/prestasi-mandiri",
            "t-1",
            "ADMIN_PT",
            "{}",
            &AppState::default(),
        );

        assert_eq!(response.status_code, 400);
        assert!(response.body.contains("level is required"));
    }

    #[test]
    fn prestasi_mandiri_create_and_list_are_paginated() {
        let state = AppState::default();
        let response = call(
            "POST",
            "/api/prestasi-mandiri",
            "t-1",
            "ADMIN_PT",
            PRESTASI,
            &state,
        );
        assert_eq!(response.status_code, 201);
        assert!(response.body.contains(r#""status":"DRAFT""#));
        assert!(response.body.contains(r#""created_by":"u-1""#));

        let response = call(
            "GET",
            "/api/prestasi-mandiri?page=1&limit=10",
            "t-1",
            "AUDITOR",
            "",
            &state,
        );
        assert_eq!(response.status_code, 200);
        assert!(response.body.contains(r#""total":1"#));
    }

    #[test]
    fn readers_cannot_write_records() {
        let response = call(
            "POST",
            "/api/prestasi-mandiri",
            "t-1",
            "MAHASISWA",
            PRESTASI,
            &AppState::default(),
        );

        assert_eq!(response.status_code, 403);
    }

    #[test]
    fn records_are_isolated_between_tenants() {
        let state = AppState::default();
        let created = call(
            "POST",
            "/api/prestasi-mandiri",
            "tenant-a",
            "ADMIN_PT",
            PRESTASI,
            &state,
        );
        let id = created_id(&created);
        let path = format!("/api/prestasi-mandiri/{id}");

        assert_eq!(
            call("GET", &path, "tenant-a", "ADMIN_PT", "", &state).status_code,
            200
        );
        assert_eq!(
            call("GET", &path, "tenant-b", "ADMIN_PT", "", &state).status_code,
            404
        );
        assert_eq!(
            call("PUT", &path, "tenant-b", "ADMIN_PT", PRESTASI, &state).status_code,
            404
        );

        let list = call(
            "GET",
            "/api/prestasi-mandiri",
            "tenant-b",
            "ADMIN_PT",
            "",
            &state,
        );
        assert!(list.body.contains(r#""total":0"#));
    }

    #[test]
    fn server_managed_fields_are_rejected() {
        let state = AppState::default();
        let body = PRESTASI.replace('{', r#"{"status":"SENT","tenant_id":"other","#);
        let response = call(
            "POST",
            "/api/prestasi-mandiri",
            "t-1",
            "ADMIN_PT",
            &body,
            &state,
        );

        assert_eq!(response.status_code, 400);
        assert!(response.body.contains("not allowed"));
    }

    #[test]
    fn update_keeps_status_and_owner() {
        let state = AppState::default();
        let created = call(
            "POST",
            "/api/prestasi-mandiri",
            "t-1",
            "ADMIN_PT",
            PRESTASI,
            &state,
        );
        let path = format!("/api/prestasi-mandiri/{}", created_id(&created));
        let changed = PRESTASI.replace("Hackathon", "Hackathon 2");
        let response = call("PUT", &path, "t-1", "ADMIN_PRODI", &changed, &state);

        assert_eq!(response.status_code, 200);
        assert!(response.body.contains("Hackathon 2"));
        assert!(response.body.contains(r#""status":"DRAFT""#));
        assert!(response.body.contains(r#""created_by":"u-1""#));
    }

    #[test]
    fn enum_mapping_put_is_an_upsert() {
        let state = AppState::default();
        let body = r#"{"category":"level","internal_code":"NAS","simkatmawa_code":"3"}"#;
        let first = call(
            "PUT",
            "/api/settings/enum-mappings",
            "t-1",
            "ADMIN_PT",
            body,
            &state,
        );
        assert_eq!(first.status_code, 201);

        let body = r#"{"category":"level","internal_code":"NAS","simkatmawa_code":"4"}"#;
        let second = call(
            "PUT",
            "/api/settings/enum-mappings",
            "t-1",
            "ADMIN_PT",
            body,
            &state,
        );
        assert_eq!(second.status_code, 200);
        assert_eq!(created_id(&first), created_id(&second));

        let list = call(
            "GET",
            "/api/settings/enum-mappings",
            "t-1",
            "AUDITOR",
            "",
            &state,
        );
        assert!(list.body.contains(r#""total":1"#));
        assert!(list.body.contains(r#""simkatmawa_code":"4""#));
    }

    #[test]
    fn enum_mapping_requires_settings_role() {
        let body = r#"{"category":"level","internal_code":"NAS","simkatmawa_code":"3"}"#;
        let response = call(
            "PUT",
            "/api/settings/enum-mappings",
            "t-1",
            "ADMIN_PRODI",
            body,
            &AppState::default(),
        );

        assert_eq!(response.status_code, 403);
    }

    fn upload_body(extra: &str) -> String {
        format!(
            r#"{{"original_filename":"sertifikat.pdf","mime_type":"application/pdf","size_bytes":10,"checksum":"abc","record_type":"prestasi-mandiri","record_id":"pm-1","document_type":"sertifikat"{extra}}}"#
        )
    }

    #[test]
    fn document_upload_validates_mime_type() {
        let body = upload_body("").replace("application/pdf", "application/octet-stream");
        let response = call(
            "POST",
            "/api/documents/upload",
            "ameta",
            "ADMIN_PT",
            &body,
            &AppState::default(),
        );

        assert_eq!(response.status_code, 400);
        assert!(response.body.contains("mime_type must be"));
    }

    #[test]
    fn document_upload_generates_public_url() {
        let response = call(
            "POST",
            "/api/documents/upload",
            "ameta",
            "ADMIN_PT",
            &upload_body(""),
            &AppState::default(),
        );

        assert_eq!(response.status_code, 201);
        assert!(response.body.contains("/tenants/ameta/"));
        assert!(response.body.contains("\"is_locked\":false"));
    }

    #[test]
    fn document_upload_ignores_client_lock_flag() {
        let body = upload_body(r#","is_locked":true"#);
        let response = call(
            "POST",
            "/api/documents/upload",
            "ameta",
            "ADMIN_PT",
            &body,
            &AppState::default(),
        );

        assert_eq!(response.status_code, 400);
    }

    #[test]
    fn document_upload_rejects_path_traversal_in_key_parts() {
        let state = AppState::default();
        for field in ["record_id", "record_type", "document_type"] {
            let body = upload_body("").replace(
                &format!(r#""{field}":""#),
                &format!(r#""{field}":"../../x"#),
            );
            let response = call(
                "POST",
                "/api/documents/upload",
                "ameta",
                "ADMIN_PT",
                &body,
                &state,
            );
            assert_eq!(response.status_code, 400, "{field}");
        }
    }

    #[test]
    fn document_key_never_contains_unsafe_tenant_segments() {
        let response = call(
            "POST",
            "/api/documents/upload",
            "../evil",
            "ADMIN_PT",
            &upload_body(""),
            &AppState::default(),
        );

        assert_eq!(response.status_code, 201);
        let body: serde_json::Value = serde_json::from_str(&response.body).expect("json body");
        for field in ["object_key", "public_url"] {
            let value = body["data"][field].as_str().expect(field);
            assert!(!value.contains(".."), "{field}: {value}");
            assert!(value.contains("tenants/---evil/"), "{field}: {value}");
        }
    }

    #[test]
    fn documents_are_isolated_between_tenants() {
        let state = AppState::default();
        let created = call(
            "POST",
            "/api/documents/upload",
            "tenant-a",
            "ADMIN_PT",
            &upload_body(""),
            &state,
        );
        let path = format!("/api/documents/{}", created_id(&created));

        assert_eq!(
            call("GET", &path, "tenant-a", "ADMIN_PT", "", &state).status_code,
            200
        );
        assert_eq!(
            call("GET", &path, "tenant-b", "ADMIN_PT", "", &state).status_code,
            404
        );
        assert_eq!(
            call("DELETE", &path, "tenant-b", "ADMIN_PT", "", &state).status_code,
            404
        );
        assert_eq!(
            call("DELETE", &path, "tenant-a", "ADMIN_PT", "", &state).status_code,
            200
        );
    }

    #[test]
    fn tenant_settings_are_per_tenant() {
        let state = AppState::default();
        let body = r#"{"slug":"a","name":"PT A"}"#;
        assert_eq!(
            call("PUT", "/api/tenant", "tenant-a", "ADMIN_PT", body, &state).status_code,
            200
        );

        let other = call("GET", "/api/tenant", "tenant-b", "ADMIN_PT", "", &state);
        assert!(other.body.contains(r#""data":null"#));
    }
}
