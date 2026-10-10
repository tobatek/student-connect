use serde_json::Value;

const ALLOWED_MIME_TYPES: &[&str] = &["application/pdf", "image/jpeg", "image/jpg", "image/png"];

pub fn validate_upload(payload: &Value, max_upload_mb: u64) -> Result<(), String> {
    require_string(payload, "original_filename")?;
    require_string(payload, "mime_type")?;
    require_string(payload, "checksum")?;
    require_string(payload, "record_type")?;
    require_string(payload, "record_id")?;
    require_string(payload, "document_type")?;

    let mime_type = payload
        .get("mime_type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !ALLOWED_MIME_TYPES.contains(&mime_type) {
        return Err("mime_type must be PDF, JPG, JPEG, or PNG".to_string());
    }

    let size_bytes = payload
        .get("size_bytes")
        .and_then(Value::as_u64)
        .ok_or_else(|| "size_bytes is required".to_string())?;
    let max_bytes = max_upload_mb * 1024 * 1024;
    if size_bytes == 0 || size_bytes > max_bytes {
        return Err(format!("size_bytes must be between 1 and {max_bytes}"));
    }

    let filename = payload
        .get("original_filename")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !is_safe_filename(filename) {
        return Err("original_filename contains unsafe characters".to_string());
    }

    Ok(())
}

pub fn safe_filename(filename: &str) -> String {
    filename
        .chars()
        .map(|ch| match ch {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '.' | '-' | '_' => ch,
            _ => '-',
        })
        .collect()
}

fn require_string(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field).and_then(Value::as_str) {
        Some(value) if !value.trim().is_empty() => Ok(()),
        _ => Err(format!("{field} is required")),
    }
}

fn is_safe_filename(filename: &str) -> bool {
    !filename.is_empty()
        && !filename.contains("..")
        && !filename.contains('/')
        && !filename.contains('\\')
        && !filename.contains('\0')
        && !filename.chars().any(char::is_control)
}
