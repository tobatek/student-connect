use crate::config::DatabaseConfig;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatabaseConnection {
    pub url: String,
    pub engine: DatabaseEngine,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DatabaseEngine {
    Postgres,
    Sqlite,
    Unsupported,
}

impl DatabaseConnection {
    pub fn from_config(config: &DatabaseConfig) -> Self {
        Self {
            url: config.url.clone(),
            engine: DatabaseEngine::from_url(&config.url),
        }
    }

    pub fn log_startup_status(&self) {
        match self.engine {
            DatabaseEngine::Postgres => println!("database configured for PostgreSQL"),
            DatabaseEngine::Sqlite => println!("database configured for SQLite local development"),
            DatabaseEngine::Unsupported => eprintln!("database url uses an unsupported scheme"),
        }
    }
}

impl DatabaseEngine {
    pub fn from_url(url: &str) -> Self {
        if url.starts_with("postgres://") || url.starts_with("postgresql://") {
            Self::Postgres
        } else if url.starts_with("sqlite://") {
            Self::Sqlite
        } else {
            Self::Unsupported
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_database_engine() {
        assert_eq!(
            DatabaseEngine::from_url("postgres://user:pass@localhost/app"),
            DatabaseEngine::Postgres
        );
        assert_eq!(
            DatabaseEngine::from_url("sqlite://student-connect.db"),
            DatabaseEngine::Sqlite
        );
    }
}
