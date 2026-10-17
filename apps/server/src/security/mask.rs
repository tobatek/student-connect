//! Penyensoran field sensitif sebelum masuk log/audit (A.8.11, A.8.15).

use serde_json::Value;

const SENSITIVE: [&str; 11] = [
    "password",
    "token",
    "secret",
    "authorization",
    "cookie",
    "api_key",
    "apikey",
    "csrf",
    "credential",
    "master_key",
    "access_key",
];

#[must_use]
pub fn is_sensitive(key: &str) -> bool {
    let k = key.to_ascii_lowercase();
    SENSITIVE.iter().any(|s| k.contains(s))
}

#[must_use]
pub fn mask(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| {
                    let masked = if is_sensitive(k) {
                        Value::String("[REDACTED]".into())
                    } else {
                        mask(v)
                    };
                    (k.clone(), masked)
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(mask).collect()),
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn masks_nested_secrets() {
        let masked = mask(&json!({
            "email": "a@b.id",
            "password": "x",
            "n": {"access_token": "t", "ok": 1},
            "l": [{"Authorization": "Bearer z"}]
        }));
        assert_eq!(masked["password"], "[REDACTED]");
        assert_eq!(masked["n"]["access_token"], "[REDACTED]");
        assert_eq!(masked["n"]["ok"], 1);
        assert_eq!(masked["l"][0]["Authorization"], "[REDACTED]");
        assert_eq!(masked["email"], "a@b.id");
    }
}
