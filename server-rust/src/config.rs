use serde::Deserialize;
use std::fs;
use std::sync::OnceLock;

static CONFIG: OnceLock<AppConfig> = OnceLock::new();

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub retention: RetentionConfig,
    #[serde(default)]
    pub rate_limit: RateLimitConfig,
    #[serde(default)]
    pub upload: UploadConfig,
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
    #[serde(default = "default_max_uploads_per_day")]
    pub max_uploads_per_day: i32,
    #[serde(default)]
    pub allowed_ips: Vec<String>,
    #[serde(default)]
    pub trusted_proxy_ips: Vec<String>,
}

const fn default_max_uploads_per_day() -> i32 {
    100
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            max_uploads_per_day: default_max_uploads_per_day(),
            allowed_ips: Vec::new(),
            trusted_proxy_ips: Vec::new(),
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct UploadConfig {
    #[serde(default = "default_max_file_size_gb")]
    pub max_file_size_gb: u64,
    #[serde(default = "default_max_total_size_gb")]
    pub max_total_size_gb: u64,
    #[serde(default = "default_chunk_size_mb")]
    pub chunk_size_mb: u64,
}

const fn default_max_file_size_gb() -> u64 { 10 }
const fn default_max_total_size_gb() -> u64 { 20 }
const fn default_chunk_size_mb() -> u64 { 8 }

impl Default for UploadConfig {
    fn default() -> Self {
        Self {
            max_file_size_gb: default_max_file_size_gb(),
            max_total_size_gb: default_max_total_size_gb(),
            chunk_size_mb: default_chunk_size_mb(),
        }
    }
}

impl UploadConfig {
    pub fn max_file_size_bytes(&self) -> u64 {
        self.max_file_size_gb.saturating_mul(1024 * 1024 * 1024)
    }

    pub fn max_total_size_bytes(&self) -> u64 {
        self.max_total_size_gb.saturating_mul(1024 * 1024 * 1024)
    }

    pub fn chunk_size_bytes(&self) -> u64 {
        self.chunk_size_mb.clamp(1, 32) * 1024 * 1024
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig { port: 3003 },
            retention: RetentionConfig {
                initial_hours: 24,
                after_download_hours: 2,
                max_lifetime_hours: 48,
            },
            rate_limit: RateLimitConfig {
                max_uploads_per_day: 100,
                allowed_ips: Vec::new(),
                trusted_proxy_ips: Vec::new(),
            },
            upload: UploadConfig::default(),
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
