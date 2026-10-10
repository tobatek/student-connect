use crate::models::record::RecordKind;
use serde_json::Value;

pub fn validate_tenant(payload: &Value) -> Result<(), String> {
    require_string(payload, "slug")?;
    require_string(payload, "name")?;
    Ok(())
}

pub fn validate_record(kind: RecordKind, payload: &Value) -> Result<(), String> {
    match kind {
        RecordKind::PrestasiMandiri => {
            require_string(payload, "lomba")?;
            require_string(payload, "level")?;
            require_string(payload, "kategori")?;
            require_string(payload, "peringkat")?;
            require_non_empty_array(payload, "mahasiswa")?;
        }
        RecordKind::Sertifikasi => {
            require_string(payload, "nama")?;
            require_string(payload, "level")?;
            require_string(payload, "penyelenggara")?;
            require_non_empty_array(payload, "mahasiswa")?;
        }
        RecordKind::Rekognisi => {
            require_string(payload, "nama")?;
            require_string(payload, "jenis")?;
            require_string(payload, "level")?;
            require_non_empty_array(payload, "mahasiswa")?;
        }
        RecordKind::Kejuaraan => {
            require_string(payload, "nama_ajang")?;
            require_string(payload, "level")?;
            require_number_or_string(payload, "tahun")?;
        }
        RecordKind::Institusi => {
            require_number_or_string(payload, "tahun")?;
        }
        RecordKind::EnumMapping => {
            payload
                .as_object()
                .filter(|object| !object.is_empty())
                .ok_or_else(|| "enum mapping payload must be a non-empty object".to_string())?;
        }
    }

    Ok(())
}

fn require_string(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field).and_then(Value::as_str) {
        Some(value) if !value.trim().is_empty() => Ok(()),
        _ => Err(format!("{field} is required")),
    }
}

fn require_non_empty_array(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field).and_then(Value::as_array) {
        Some(value) if !value.is_empty() => Ok(()),
        _ => Err(format!("{field} must contain at least one item")),
    }
}

fn require_number_or_string(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field) {
        Some(Value::Number(_)) => Ok(()),
        Some(Value::String(value)) if !value.trim().is_empty() => Ok(()),
        _ => Err(format!("{field} is required")),
    }
}
