use crate::models::record::RecordKind;
use serde_json::Value;

const LEVELS: &[&str] = &["KAB", "PROV", "NAS", "INT"];
const KATEGORI: &[&str] = &["RISNOV", "RISNOVSSH", "SENBUD", "OLAHRAGA", "MINAT"];
const PERINGKAT: &[&str] = &[
    "JUARA1",
    "JUARA2",
    "JUARA3",
    "HARAPAN1",
    "HARAPAN2",
    "HARAPAN3",
    "APRESIASI",
    "PESERTA",
];
const KELOMPOK: &[&str] = &["INDIVIDU", "KELOMPOK"];
const BENTUK: &[&str] = &["LURING", "DARING"];
const BENTUK_KEJUARAAN: &[&str] = &["LURING", "DARING", "HIBRID"];
const JENIS_REKOGNISI: &[&str] = &[
    "SERKOM", "JURIOR", "JURINOR", "KEYCONF", "KEYWORK", "PAMERAN", "KARYA", "BUKU", "PATEN",
    "PUB", "DUTA", "PTG", "PSB", "PKD",
];
const JENIS_PENYELENGGARAAN: &[&str] = &["MANDIRI", "MANDIRI_TERVERIFIKASI"];
const ENUM_CATEGORIES: &[&str] = &[
    "level",
    "kategori",
    "peringkat",
    "jenis_rekognisi",
    "bentuk",
];

const URL_FIELDS: &[&str] = &[
    "url_peserta",
    "url_sertifikat",
    "url_foto_upp",
    "url_dokumen_undangan",
];

const SUBMISSION_COMMON: &[&str] = &[
    "level",
    "penyelenggara",
    "url_peserta",
    "url_sertifikat",
    "tgl_sertifikat",
    "url_foto_upp",
    "url_dokumen_undangan",
    "keterangan",
    "mahasiswa",
    "dosen",
];
const PRESTASI_MANDIRI_FIELDS: &[&str] = &[
    "kategori",
    "lomba",
    "cabang",
    "peringkat",
    "jumlah_unit_peserta",
    "kelompok_prestasi",
    "bentuk",
];
const SERTIFIKASI_FIELDS: &[&str] = &["nama"];
const REKOGNISI_FIELDS: &[&str] = &["nama", "jenis"];
const KEJUARAAN_FIELDS: &[&str] = &[
    "nama_ajang",
    "jenis_penyelenggaraan",
    "level",
    "kategori",
    "bentuk",
    "tempat",
    "url_ajang",
    "tahun",
    "url_laporan",
    "total_peserta",
    "peserta_list",
    "juara_list",
    "is_ready_for_web_input",
];
const INSTITUSI_FIELDS: &[&str] = &["tahun", "indikator", "finansial"];
const ENUM_MAPPING_FIELDS: &[&str] = &[
    "category",
    "internal_code",
    "internal_label",
    "simkatmawa_code",
    "keterangan",
];
const TENANT_FIELDS: &[&str] = &[
    "slug",
    "name",
    "kode_pt",
    "logo_url",
    "warna_tema",
    "tahun_aktif",
    "r2_prefix",
    "allow_kab_rekognisi",
];

const MAX_SHORT_TEXT: usize = 300;
const MAX_LONG_TEXT: usize = 2_000;
const MAX_URL: usize = 2_048;
const MAX_LIST_ITEMS: usize = 200;

pub fn validate_tenant(payload: &Value) -> Result<(), String> {
    reject_unknown_fields(payload, TENANT_FIELDS)?;
    required_text(payload, "slug", MAX_SHORT_TEXT)?;
    required_text(payload, "name", MAX_SHORT_TEXT)?;
    optional_text(payload, "kode_pt", MAX_SHORT_TEXT)?;
    optional_text(payload, "warna_tema", MAX_SHORT_TEXT)?;
    optional_text(payload, "r2_prefix", MAX_SHORT_TEXT)?;
    optional_url(payload, "logo_url")?;
    Ok(())
}

pub fn validate_record(kind: RecordKind, payload: &Value) -> Result<(), String> {
    match kind {
        RecordKind::PrestasiMandiri => {
            reject_unknown_fields(
                payload,
                &[SUBMISSION_COMMON, PRESTASI_MANDIRI_FIELDS].concat(),
            )?;
            required_enum(payload, "level", LEVELS)?;
            required_enum(payload, "kategori", KATEGORI)?;
            required_enum(payload, "peringkat", PERINGKAT)?;
            required_text(payload, "lomba", MAX_SHORT_TEXT)?;
            optional_text(payload, "cabang", MAX_SHORT_TEXT)?;
            optional_text(payload, "jumlah_unit_peserta", MAX_SHORT_TEXT)?;
            optional_enum(payload, "kelompok_prestasi", KELOMPOK)?;
            optional_enum(payload, "bentuk", BENTUK)?;
            validate_submission_common(payload)?;
        }
        RecordKind::Sertifikasi => {
            reject_unknown_fields(payload, &[SUBMISSION_COMMON, SERTIFIKASI_FIELDS].concat())?;
            required_enum(payload, "level", LEVELS)?;
            required_text(payload, "nama", MAX_SHORT_TEXT)?;
            required_text(payload, "penyelenggara", MAX_SHORT_TEXT)?;
            validate_submission_common(payload)?;
        }
        RecordKind::Rekognisi => {
            reject_unknown_fields(payload, &[SUBMISSION_COMMON, REKOGNISI_FIELDS].concat())?;
            required_enum(payload, "level", LEVELS)?;
            required_enum(payload, "jenis", JENIS_REKOGNISI)?;
            required_text(payload, "nama", MAX_SHORT_TEXT)?;
            validate_submission_common(payload)?;
        }
        RecordKind::Kejuaraan => {
            reject_unknown_fields(payload, KEJUARAAN_FIELDS)?;
            required_text(payload, "nama_ajang", MAX_SHORT_TEXT)?;
            required_enum(payload, "level", LEVELS)?;
            required_year(payload, "tahun")?;
            optional_enum(payload, "jenis_penyelenggaraan", JENIS_PENYELENGGARAAN)?;
            optional_enum(payload, "kategori", KATEGORI)?;
            optional_enum(payload, "bentuk", BENTUK_KEJUARAAN)?;
            optional_text(payload, "tempat", MAX_SHORT_TEXT)?;
            optional_url(payload, "url_ajang")?;
            optional_url(payload, "url_laporan")?;
            optional_count(payload, "total_peserta")?;
            optional_text_list(payload, "peserta_list")?;
            optional_text_list(payload, "juara_list")?;
            optional_bool(payload, "is_ready_for_web_input")?;
        }
        RecordKind::Institusi => {
            reject_unknown_fields(payload, INSTITUSI_FIELDS)?;
            required_year(payload, "tahun")?;
            optional_container(payload, "indikator")?;
            optional_container(payload, "finansial")?;
        }
        RecordKind::EnumMapping => {
            reject_unknown_fields(payload, ENUM_MAPPING_FIELDS)?;
            required_enum(payload, "category", ENUM_CATEGORIES)?;
            required_text(payload, "internal_code", MAX_SHORT_TEXT)?;
            required_text(payload, "simkatmawa_code", MAX_SHORT_TEXT)?;
            optional_text(payload, "internal_label", MAX_SHORT_TEXT)?;
            optional_text(payload, "keterangan", MAX_LONG_TEXT)?;
        }
    }

    Ok(())
}

fn validate_submission_common(payload: &Value) -> Result<(), String> {
    optional_text(payload, "penyelenggara", MAX_SHORT_TEXT)?;
    optional_text(payload, "keterangan", MAX_LONG_TEXT)?;
    for field in URL_FIELDS {
        optional_url(payload, field)?;
    }
    optional_date(payload, "tgl_sertifikat")?;
    validate_people(
        payload,
        "mahasiswa",
        true,
        &["nim", "nama", "prodi"],
        &["nim", "nama"],
    )?;
    validate_people(
        payload,
        "dosen",
        false,
        &["nuptk", "nama", "url_surat_tugas"],
        &["nuptk", "nama"],
    )
}

fn validate_people(
    payload: &Value,
    field: &str,
    required: bool,
    allowed: &[&str],
    mandatory: &[&str],
) -> Result<(), String> {
    let items = match payload.get(field) {
        None | Some(Value::Null) => &Vec::new(),
        Some(Value::Array(items)) => items,
        Some(_) => return Err(format!("{field} must be a list")),
    };
    if required && items.is_empty() {
        return Err(format!("{field} must contain at least one item"));
    }
    if items.len() > MAX_LIST_ITEMS {
        return Err(format!("{field} has too many items"));
    }

    for item in items {
        reject_unknown_fields(item, allowed).map_err(|error| format!("{field}: {error}"))?;
        for key in mandatory {
            required_text(item, key, MAX_SHORT_TEXT)
                .map_err(|error| format!("{field}: {error}"))?;
        }
        for key in allowed {
            if key.starts_with("url_") {
                optional_url(item, key).map_err(|error| format!("{field}: {error}"))?;
            } else {
                optional_text(item, key, MAX_SHORT_TEXT)
                    .map_err(|error| format!("{field}: {error}"))?;
            }
        }
    }

    Ok(())
}

fn reject_unknown_fields(payload: &Value, allowed: &[&str]) -> Result<(), String> {
    let object = payload
        .as_object()
        .ok_or_else(|| "payload must be an object".to_string())?;

    match object.keys().find(|key| !allowed.contains(&key.as_str())) {
        Some(key) => Err(format!(
            "field '{}' is not allowed",
            key.chars().take(50).collect::<String>()
        )),
        None => Ok(()),
    }
}

fn required_text(payload: &Value, field: &str, max_len: usize) -> Result<(), String> {
    match payload.get(field).and_then(Value::as_str) {
        Some(value) if !value.trim().is_empty() => check_text(field, value, max_len),
        _ => Err(format!("{field} is required")),
    }
}

fn optional_text(payload: &Value, field: &str, max_len: usize) -> Result<(), String> {
    match payload.get(field) {
        None | Some(Value::Null) => Ok(()),
        Some(Value::String(value)) => check_text(field, value, max_len),
        Some(_) => Err(format!("{field} must be a string")),
    }
}

fn check_text(field: &str, value: &str, max_len: usize) -> Result<(), String> {
    if value.chars().count() > max_len {
        return Err(format!("{field} must be at most {max_len} characters"));
    }
    if value.contains('\0') {
        return Err(format!("{field} contains invalid characters"));
    }
    Ok(())
}

fn required_enum(payload: &Value, field: &str, allowed: &[&str]) -> Result<(), String> {
    match payload.get(field).and_then(Value::as_str) {
        Some(value) if allowed.contains(&value) => Ok(()),
        Some(value) if !value.trim().is_empty() => Err(format!("{field} has an invalid value")),
        _ => Err(format!("{field} is required")),
    }
}

fn optional_enum(payload: &Value, field: &str, allowed: &[&str]) -> Result<(), String> {
    match payload.get(field) {
        None | Some(Value::Null) => Ok(()),
        Some(Value::String(value)) if value.is_empty() || allowed.contains(&value.as_str()) => {
            Ok(())
        }
        Some(_) => Err(format!("{field} has an invalid value")),
    }
}

/// Only http(s) links are accepted so stored values can never become `javascript:` hrefs.
fn optional_url(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field) {
        None | Some(Value::Null) => Ok(()),
        Some(Value::String(value)) if value.is_empty() => Ok(()),
        Some(Value::String(value)) => {
            if value.len() > MAX_URL
                || !(value.starts_with("https://") || value.starts_with("http://"))
                || value
                    .chars()
                    .any(|ch| ch.is_control() || ch.is_whitespace())
            {
                Err(format!("{field} must be a valid http(s) URL"))
            } else {
                Ok(())
            }
        }
        Some(_) => Err(format!("{field} must be a string")),
    }
}

/// `YYYY-MM-DD`.
fn optional_date(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field) {
        None | Some(Value::Null) => Ok(()),
        Some(Value::String(value)) if value.is_empty() || is_iso_date(value) => Ok(()),
        Some(_) => Err(format!("{field} must be a date in YYYY-MM-DD format")),
    }
}

fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let digits = |range: std::ops::Range<usize>| value[range].parse::<u32>().ok();
    let (Some(_), Some(month), Some(day)) = (digits(0..4), digits(5..7), digits(8..10)) else {
        return false;
    };
    (1..=12).contains(&month) && (1..=31).contains(&day)
}

fn required_year(payload: &Value, field: &str) -> Result<(), String> {
    let year = match payload.get(field) {
        Some(Value::Number(number)) => number.as_u64(),
        Some(Value::String(value)) => value.trim().parse::<u64>().ok(),
        _ => return Err(format!("{field} is required")),
    };
    match year {
        Some(year) if (2000..=2100).contains(&year) => Ok(()),
        _ => Err(format!("{field} must be a year between 2000 and 2100")),
    }
}

fn optional_count(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field) {
        None | Some(Value::Null) => Ok(()),
        Some(Value::Number(number)) if number.as_u64().is_some() => Ok(()),
        Some(_) => Err(format!("{field} must be a non-negative integer")),
    }
}

fn optional_bool(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field) {
        None | Some(Value::Null) | Some(Value::Bool(_)) => Ok(()),
        Some(_) => Err(format!("{field} must be a boolean")),
    }
}

fn optional_text_list(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field) {
        None | Some(Value::Null) => Ok(()),
        Some(Value::Array(items)) if items.len() <= MAX_LIST_ITEMS => {
            for item in items {
                match item.as_str() {
                    Some(value) => check_text(field, value, MAX_SHORT_TEXT)?,
                    None => return Err(format!("{field} must contain only strings")),
                }
            }
            Ok(())
        }
        Some(_) => Err(format!(
            "{field} must be a list of at most {MAX_LIST_ITEMS} items"
        )),
    }
}

fn optional_container(payload: &Value, field: &str) -> Result<(), String> {
    match payload.get(field) {
        None | Some(Value::Null) | Some(Value::Array(_)) | Some(Value::Object(_)) => Ok(()),
        Some(_) => Err(format!("{field} must be an object or a list")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid_prestasi() -> Value {
        json!({
            "lomba": "Hackathon",
            "level": "NAS",
            "kategori": "RISNOV",
            "peringkat": "JUARA1",
            "mahasiswa": [{"nim": "1", "nama": "A"}]
        })
    }

    #[test]
    fn accepts_valid_prestasi_mandiri() {
        assert!(validate_record(RecordKind::PrestasiMandiri, &valid_prestasi()).is_ok());
    }

    #[test]
    fn rejects_server_managed_fields() {
        for field in [
            "status",
            "tenant_id",
            "created_by",
            "simkatmawa_id",
            "sent_at",
            "id",
        ] {
            let mut payload = valid_prestasi();
            payload[field] = json!("x");
            let error = validate_record(RecordKind::PrestasiMandiri, &payload).unwrap_err();
            assert!(error.contains("not allowed"), "{field}: {error}");
        }
    }

    #[test]
    fn rejects_invalid_enum_value() {
        let mut payload = valid_prestasi();
        payload["level"] = json!("GALAKSI");
        assert_eq!(
            validate_record(RecordKind::PrestasiMandiri, &payload).unwrap_err(),
            "level has an invalid value"
        );
    }

    #[test]
    fn rejects_non_http_urls() {
        let mut payload = valid_prestasi();
        payload["url_sertifikat"] = json!("javascript:alert(1)");
        assert!(validate_record(RecordKind::PrestasiMandiri, &payload).is_err());
        payload["url_sertifikat"] = json!("https://dokumen.example.ac.id/a.pdf");
        assert!(validate_record(RecordKind::PrestasiMandiri, &payload).is_ok());
    }

    #[test]
    fn rejects_overlong_text_and_bad_dates() {
        let mut payload = valid_prestasi();
        payload["lomba"] = json!("x".repeat(MAX_SHORT_TEXT + 1));
        assert!(validate_record(RecordKind::PrestasiMandiri, &payload).is_err());

        let mut payload = valid_prestasi();
        payload["tgl_sertifikat"] = json!("2026-13-01");
        assert!(validate_record(RecordKind::PrestasiMandiri, &payload).is_err());
        payload["tgl_sertifikat"] = json!("2026-05-01");
        assert!(validate_record(RecordKind::PrestasiMandiri, &payload).is_ok());
    }

    #[test]
    fn validates_participants() {
        let mut payload = valid_prestasi();
        payload["mahasiswa"] = json!([{"nim": "1"}]);
        assert!(validate_record(RecordKind::PrestasiMandiri, &payload).is_err());
        payload["mahasiswa"] = json!([]);
        assert!(validate_record(RecordKind::PrestasiMandiri, &payload).is_err());
    }

    #[test]
    fn validates_enum_mapping() {
        let ok = json!({"category": "level", "internal_code": "NAS", "simkatmawa_code": "3"});
        assert!(validate_record(RecordKind::EnumMapping, &ok).is_ok());
        let bad = json!({"category": "warna", "internal_code": "NAS", "simkatmawa_code": "3"});
        assert!(validate_record(RecordKind::EnumMapping, &bad).is_err());
    }

    #[test]
    fn validates_kejuaraan_year() {
        let payload = json!({"nama_ajang": "A", "level": "NAS", "tahun": 1800});
        assert!(validate_record(RecordKind::Kejuaraan, &payload).is_err());
        let payload = json!({"nama_ajang": "A", "level": "NAS", "tahun": 2026});
        assert!(validate_record(RecordKind::Kejuaraan, &payload).is_ok());
    }
}
