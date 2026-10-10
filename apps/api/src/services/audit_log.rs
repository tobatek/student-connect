use crate::http::escape_json;
use crate::middleware::rbac::AuthContext;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[allow(dead_code)]
pub enum AuditAction {
    ReadTenant,
    UpdateTenant,
    Login,
    UpdateCredential,
    UploadDocument,
    DeleteDocument,
    SubmitSimkatmawa,
    UpdateEnumMapping,
    CreateRecord,
    UpdateRecord,
}

impl AuditAction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReadTenant => "READ_TENANT",
            Self::UpdateTenant => "UPDATE_TENANT",
            Self::Login => "LOGIN",
            Self::UpdateCredential => "UPDATE_CREDENTIAL",
            Self::UploadDocument => "UPLOAD_DOCUMENT",
            Self::DeleteDocument => "DELETE_DOCUMENT",
            Self::SubmitSimkatmawa => "SUBMIT_SIMKATMAWA",
            Self::UpdateEnumMapping => "UPDATE_ENUM_MAPPING",
            Self::CreateRecord => "CREATE_RECORD",
            Self::UpdateRecord => "UPDATE_RECORD",
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct AuditLogService;

impl AuditLogService {
    pub fn stdout() -> Self {
        Self
    }

    pub fn record(&self, action: AuditAction, auth: &AuthContext, payload: Option<&str>) {
        let payload = payload
            .map(mask_sensitive_fields)
            .unwrap_or_else(|| "{}".to_string());
        println!(
            r#"audit action="{}" user_id="{}" tenant_id="{}" role="{}" payload="{}""#,
            action.as_str(),
            escape_json(&auth.user_id),
            escape_json(&auth.tenant_id),
            auth.role.as_str(),
            escape_json(&payload)
        );
    }
}

impl AuditLogService {
    /// Logs which entity was touched without copying the request body into the log.
    pub fn record_entity(
        &self,
        action: AuditAction,
        auth: &AuthContext,
        entity: &str,
        entity_id: &str,
    ) {
        println!(
            r#"audit action="{}" user_id="{}" tenant_id="{}" role="{}" entity="{}" entity_id="{}""#,
            action.as_str(),
            escape_json(&auth.user_id),
            escape_json(&auth.tenant_id),
            auth.role.as_str(),
            escape_json(entity),
            escape_json(entity_id)
        );
    }
}

pub fn mask_sensitive_fields(payload: &str) -> String {
    let sensitive_keys = [
        "password",
        "token",
        "access_token",
        "secret",
        "secret_access_key",
        "credential_master_key",
    ];
    let mut masked = payload.to_string();

    for key in sensitive_keys {
        masked = mask_json_like_key(&masked, key);
    }

    masked
}

fn mask_json_like_key(payload: &str, key: &str) -> String {
    let quoted_key = format!(r#""{key}""#);
    let mut masked = String::with_capacity(payload.len());
    let mut remaining = payload;

    loop {
        let remaining_lowercase = remaining.to_ascii_lowercase();
        let Some(key_start) = remaining_lowercase.find(&quoted_key) else {
            masked.push_str(remaining);
            return masked;
        };
        let Some(colon_offset) = remaining[key_start..].find(':') else {
            masked.push_str(remaining);
            return masked;
        };
        let value_start = key_start + colon_offset + 1;
        let Some(first_quote_offset) = remaining[value_start..].find('"') else {
            masked.push_str(remaining);
            return masked;
        };
        let value_quote_start = value_start + first_quote_offset;
        let Some(value_end_offset) = remaining[value_quote_start + 1..].find('"') else {
            masked.push_str(remaining);
            return masked;
        };
        let value_quote_end = value_quote_start + 1 + value_end_offset;

        masked.push_str(&remaining[..value_quote_start]);
        masked.push_str("\"***\"");
        remaining = &remaining[value_quote_end + 1..];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_sensitive_values() {
        let masked = mask_sensitive_fields(
            r#"{"email":"admin@example.test","password":"secret","token":"abc"}"#,
        );

        assert!(masked.contains(r#""password":"***""#));
        assert!(masked.contains(r#""token":"***""#));
        assert!(!masked.contains("secret"));
        assert!(!masked.contains("abc"));
    }

    #[test]
    fn masks_repeated_sensitive_values() {
        let masked = mask_sensitive_fields(
            r#"{"items":[{"password":"one"},{"password":"two"}],"secret":"three"}"#,
        );

        assert_eq!(masked.matches("***").count(), 3);
        assert!(!masked.contains("one"));
        assert!(!masked.contains("two"));
        assert!(!masked.contains("three"));
    }
}
