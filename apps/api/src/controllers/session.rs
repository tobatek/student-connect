use crate::middleware::rbac::AuthContext;

pub fn current(auth: &AuthContext) -> String {
    format!(
        r#"{{"status":"ok","data":{{"user_id":"{}","tenant_id":"{}","role":"{}"}}}}"#,
        crate::http::escape_json(&auth.user_id),
        crate::http::escape_json(&auth.tenant_id),
        auth.role.as_str()
    )
}
