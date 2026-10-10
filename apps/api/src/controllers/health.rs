use crate::config::AppConfig;
use crate::http::escape_json;

pub fn show(config: &AppConfig) -> String {
    format!(
        r#"{{"status":"ok","service":"students-connect-api","env":"{}"}}"#,
        escape_json(&config.server.app_env)
    )
}
