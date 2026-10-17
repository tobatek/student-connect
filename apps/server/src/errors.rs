//! Galat HTTP bertipe agar status code selalu benar dan pesan tidak membocorkan detail internal.

use std::collections::BTreeMap;

use axum::http::StatusCode;
use loco_rs::{controller::ErrorDetail, Error, Result};

fn custom<T>(status: StatusCode, code: &str, message: &str) -> Result<T> {
    Err(Error::CustomError(status, ErrorDetail::new(code, message)))
}

/// # Errors
/// Selalu mengembalikan 403.
pub fn forbidden<T>(message: &str) -> Result<T> {
    custom(StatusCode::FORBIDDEN, "forbidden", message)
}

/// # Errors
/// Selalu mengembalikan 409.
pub fn conflict<T>(message: &str) -> Result<T> {
    custom(StatusCode::CONFLICT, "conflict", message)
}

/// # Errors
/// Selalu mengembalikan 422.
pub fn unprocessable<T>(message: &str) -> Result<T> {
    custom(StatusCode::UNPROCESSABLE_ENTITY, "unprocessable", message)
}

/// # Errors
/// Selalu mengembalikan 413.
pub fn too_large<T>(message: &str) -> Result<T> {
    custom(StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large", message)
}

/// # Errors
/// Selalu mengembalikan 429.
pub fn too_many_requests<T>(message: &str) -> Result<T> {
    custom(StatusCode::TOO_MANY_REQUESTS, "too_many_requests", message)
}

/// # Errors
/// Selalu mengembalikan 502.
pub fn bad_gateway<T>(message: &str) -> Result<T> {
    custom(StatusCode::BAD_GATEWAY, "bad_gateway", message)
}

/// Galat validasi per-field: `{"error":"validation","errors":{"field":"pesan"}}`.
///
/// # Errors
/// Selalu mengembalikan 400.
pub fn validation<T>(fields: &BTreeMap<String, String>) -> Result<T> {
    Err(Error::CustomError(
        StatusCode::BAD_REQUEST,
        ErrorDetail {
            error: Some("validation".to_string()),
            description: Some("Data tidak valid.".to_string()),
            errors: Some(serde_json::to_value(fields).unwrap_or_default()),
        },
    ))
}

/// Kumpulan galat field.
#[derive(Debug, Default)]
pub struct FieldErrors(pub BTreeMap<String, String>);

impl FieldErrors {
    pub fn add(&mut self, field: &str, message: &str) {
        self.0.entry(field.to_string()).or_insert_with(|| message.to_string());
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Galat 400 siap dikembalikan dari handler.
    #[must_use]
    pub fn into_error(self) -> Error {
        Error::CustomError(
            StatusCode::BAD_REQUEST,
            ErrorDetail {
                error: Some("validation".to_string()),
                description: Some("Data tidak valid.".to_string()),
                errors: Some(serde_json::to_value(&self.0).unwrap_or_default()),
            },
        )
    }

    /// # Errors
    /// 400 bila ada galat terkumpul.
    pub fn into_result(self) -> Result<()> {
        if self.0.is_empty() {
            Ok(())
        } else {
            validation(&self.0)
        }
    }
}
