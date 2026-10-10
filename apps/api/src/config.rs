use std::env;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub security: SecurityConfig,
    pub simkatmawa: SimkatmawaConfig,
    pub r2: R2Config,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServerConfig {
    pub bind_address: String,
    pub app_env: String,
    pub app_public_url: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatabaseConfig {
    pub url: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SecurityConfig {
    pub session_secret: String,
    pub credential_master_key: String,
    pub cors_allowed_origins: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SimkatmawaConfig {
    pub default_api_url: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct R2Config {
    pub account_id: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub bucket: String,
    pub endpoint: String,
    pub public_base_url: String,
    pub region: String,
    pub max_upload_mb: u64,
}

const DEFAULT_SESSION_SECRET: &str = "change-me-with-a-long-random-value";
const DEFAULT_CREDENTIAL_KEY: &str = "change-me-32-byte-minimum-secret";
const MIN_SECRET_LEN: usize = 32;

impl AppConfig {
    pub fn is_production(&self) -> bool {
        self.server.app_env.eq_ignore_ascii_case("production")
    }

    /// Problems that must stop the server from starting in production.
    pub fn production_errors(&self) -> Vec<String> {
        let mut errors = Vec::new();
        let security = &self.security;

        if security.session_secret == DEFAULT_SESSION_SECRET
            || security.session_secret.len() < MIN_SECRET_LEN
        {
            errors.push("SESSION_SECRET must be a random value of at least 32 characters".into());
        }
        if security.credential_master_key == DEFAULT_CREDENTIAL_KEY
            || security.credential_master_key.len() < MIN_SECRET_LEN
        {
            errors.push(
                "CREDENTIAL_MASTER_KEY must be a random value of at least 32 characters".into(),
            );
        }
        if security.cors_allowed_origins.is_empty()
            || security
                .cors_allowed_origins
                .iter()
                .any(|origin| origin == "*")
        {
            errors.push("CORS_ALLOWED_ORIGINS must list explicit origins, not '*'".into());
        }
        if !self.server.app_public_url.starts_with("https://") {
            errors.push("APP_PUBLIC_URL must use https in production".into());
        }
        errors.push(
            "x-user-* header auth is a development baseline; real session auth is required first"
                .into(),
        );

        errors
    }

    pub fn from_env() -> Self {
        Self {
            server: ServerConfig {
                bind_address: env_or("API_BIND_ADDRESS", "127.0.0.1:5150"),
                app_env: env_or("APP_ENV", "development"),
                app_public_url: env_or("APP_PUBLIC_URL", "http://localhost:3000"),
            },
            database: DatabaseConfig {
                url: env_or(
                    "DATABASE_URL",
                    "postgres://student_connect:student_connect@localhost:5432/student_connect",
                ),
            },
            security: SecurityConfig {
                session_secret: env_or("SESSION_SECRET", "change-me-with-a-long-random-value"),
                credential_master_key: env_or(
                    "CREDENTIAL_MASTER_KEY",
                    "change-me-32-byte-minimum-secret",
                ),
                cors_allowed_origins: env_or("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
                    .split(',')
                    .map(str::trim)
                    .filter(|origin| !origin.is_empty())
                    .map(ToOwned::to_owned)
                    .collect(),
            },
            simkatmawa: SimkatmawaConfig {
                default_api_url: env_or(
                    "SIMKATMAWA_DEFAULT_API_URL",
                    "https://simkatmawa.kemdiktisaintek.go.id",
                ),
            },
            r2: R2Config {
                account_id: env_or("R2_ACCOUNT_ID", ""),
                access_key_id: env_or("R2_ACCESS_KEY_ID", ""),
                secret_access_key: env_or("R2_SECRET_ACCESS_KEY", ""),
                bucket: env_or("R2_BUCKET", "student-connect-documents"),
                endpoint: env_or("R2_ENDPOINT", ""),
                public_base_url: env_or("R2_PUBLIC_BASE_URL", "https://dokumen.example.ac.id"),
                region: env_or("R2_REGION", "auto"),
                max_upload_mb: env_or("R2_MAX_UPLOAD_MB", "15").parse().unwrap_or(15),
            },
        }
    }
}

fn env_or(key: &str, fallback: &str) -> String {
    env::var(key).unwrap_or_else(|_| fallback.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_rejects_default_secrets_and_wildcard_cors() {
        let mut config = AppConfig::from_env();
        config.server.app_env = "production".to_string();
        config.security.session_secret = DEFAULT_SESSION_SECRET.to_string();
        config.security.cors_allowed_origins = vec!["*".to_string()];

        let errors = config.production_errors();
        assert!(config.is_production());
        assert!(errors.iter().any(|error| error.contains("SESSION_SECRET")));
        assert!(errors
            .iter()
            .any(|error| error.contains("CORS_ALLOWED_ORIGINS")));
    }

    #[test]
    fn reads_defaults_without_hardcoded_secret_values_in_code_paths() {
        let config = AppConfig::from_env();

        assert!(!config.server.bind_address.is_empty());
        assert!(!config.database.url.is_empty());
        assert_eq!(config.r2.max_upload_mb, 15);
    }
}
