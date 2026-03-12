use serde::Deserialize;
use std::fs;
use std::sync::OnceLock;

static CONFIG: OnceLock<AppConfig> = OnceLock::new();

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub upload_password: String,
    pub server: ServerConfig,
    pub retention: RetentionConfig,
    pub rate_limit: RateLimitConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    pub port: u16,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RetentionConfig {
    pub initial_hours: i64,
    pub after_download_hours: i64,
    pub max_lifetime_hours: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RateLimitConfig {
    pub max_uploads_per_day: i32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            upload_password: "filesgo123".to_string(),
            server: ServerConfig { port: 3003 },
            retention: RetentionConfig {
                initial_hours: 24,
                after_download_hours: 2,
                max_lifetime_hours: 48,
            },
            rate_limit: RateLimitConfig {
                max_uploads_per_day: 100,
            },
        }
    }
}

impl AppConfig {
    pub fn load() -> &'static Self {
        CONFIG.get_or_init(|| {
            match fs::read_to_string("config.yaml") {
                Ok(content) => {
                    match serde_yaml::from_str(&content) {
                        Ok(config) => {
                            log::info!("Configuration loaded from config.yaml");
                            config
                        }
                        Err(e) => {
                            log::warn!("Failed to parse config.yaml, using defaults: {}", e);
                            Self::default()
                        }
                    }
                }
                Err(e) => {
                    log::warn!("Failed to read config.yaml, using defaults: {}", e);
                    Self::default()
                }
            }
        })
    }

    pub fn get() -> &'static Self {
        CONFIG.get().unwrap_or_else(|| Self::load())
    }
}
