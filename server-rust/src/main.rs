mod config;
mod crypto;
mod database;
mod handlers;
mod models;
mod websocket;

use actix::Actor;
use actix_cors::Cors;
use actix_files::NamedFile;
use actix_web::{middleware, web, App, HttpServer};
use config::AppConfig;
use database::init_db;
use handlers::AppState;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::fs;
use std::sync::Arc;
use tokio::time::{interval, Duration};

async fn cleanup_task(state: web::Data<AppState>) {
    let mut cleanup_interval = interval(Duration::from_secs(60));
    
    loop {
        cleanup_interval.tick().await;
        
        let config = AppConfig::get();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        {
            let mut records = state.file_records.write();
            let codes_to_remove: Vec<String> = records
                .iter()
                .filter(|(_, record)| {
                    let max_lifetime = record.uploaded_at + config.retention.max_lifetime_hours * 3600;
                    now > max_lifetime || now > record.expire_at
                })
                .map(|(code, _)| code.clone())
                .collect();

            for code in codes_to_remove {
                if let Some(record) = records.remove(&code) {
                    fs::remove_file(&record.file_path).ok();
                    log::info!("Cleaned up file: {}", code);
                }
            }
        }

        match database::cleanup_expired_files(&state.db) {
            Ok(paths) => {
                for path in paths {
                    fs::remove_file(&path).ok();
                }
            }
            Err(e) => log::error!("Cleanup error: {}", e),
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let config = AppConfig::load();
    log::info!("Configuration loaded, upload password configured, daily upload limit: {} times", 
        config.rate_limit.max_uploads_per_day);

    let db = init_db("filesgo.db").expect("Failed to initialize database");
    log::info!("Database initialized");

    let hub = websocket::HubActor::new().start();

    let file_records = Arc::new(RwLock::new(HashMap::new()));
    let ip_upload_records = Arc::new(RwLock::new(HashMap::new()));

    let port = std::env::var("PORT")
        .unwrap_or_else(|_| config.server.port.to_string())
        .parse::<u16>()
        .unwrap_or(8080);

    let server_addr = std::env::var("SERVER_ADDR")
        .unwrap_or_else(|_| "http://103.69.128.25:8080".to_string());

    fs::create_dir_all("uploads").ok();

    let app_state = web::Data::new(AppState {
        db,
        hub: hub.clone(),
        file_records,
        ip_upload_records,
        server_addr,
    });

    let cleanup_state = app_state.clone();
    tokio::spawn(async move {
        cleanup_task(cleanup_state).await;
    });

    log::info!("Server running on http://localhost:{}", port);
    log::info!("WebSocket endpoint: ws://localhost:{}/ws", port);

    HttpServer::new(move || {
        let cors = Cors::permissive();

        App::new()
            .app_data(app_state.clone())
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .service(
                web::scope("/api")
                    .route("/verify-password", web::post().to(handlers::verify_password))
                    .route("/upload", web::post().to(handlers::upload_file))
                    .route("/upload/chunk", web::post().to(handlers::upload_chunk))
                    .route("/upload/complete", web::post().to(handlers::upload_complete))
                    .route("/file/{code}", web::get().to(handlers::get_file_info))
                    .route("/download/{code}", web::get().to(handlers::download_file))
                    .route("/file/{code}", web::delete().to(handlers::delete_file))
                    .route("/device/register", web::post().to(handlers::register_device))
                    .route("/device/info", web::get().to(handlers::get_device_info))
                    .route("/device/name", web::put().to(handlers::update_device_name))
                    .route("/pairing/generate-key", web::post().to(handlers::generate_pairing_key))
                    .route("/pairing/request", web::post().to(handlers::request_pairing))
                    .route("/pairing/accept", web::post().to(handlers::accept_pairing))
                    .route("/pairing/reject", web::post().to(handlers::reject_pairing))
                    .route("/pairing/list", web::get().to(handlers::get_paired_devices))
                    .route("/pairing/pending", web::get().to(handlers::get_pending_pairing_requests))
                    .route("/pairing/{device_id}", web::delete().to(handlers::delete_pairing))
                    .route("/messages", web::get().to(handlers::get_messages))
                    .route("/message/send", web::post().to(handlers::send_message))
                    .route("/message/{message_id}/status", web::put().to(handlers::update_message_status))
                    .route("/messages/unread", web::get().to(handlers::get_unread_count))
            )
            .route("/ws", web::get().to(handlers::websocket_route))
            .route("/", web::get().to(serve_index))
            .route("/graphic", web::get().to(serve_index))
            .default_service(web::get().to(serve_static))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}

async fn serve_index() -> actix_web::Result<NamedFile> {
    let index_path = std::env::var("FRONTEND_PATH")
        .unwrap_or_else(|_| "dist/index.html".to_string());
    
    NamedFile::open(&index_path).map_err(|_| {
        actix_web::error::ErrorNotFound("Frontend not found. Set FRONTEND_PATH environment variable.")
    })
}

async fn serve_static(req: actix_web::HttpRequest) -> actix_web::Result<NamedFile> {
    let path = req.path().trim_start_matches('/');
    let frontend_path = std::env::var("FRONTEND_PATH")
        .unwrap_or_else(|_| "dist".to_string());
    
    if path.is_empty() || path == "index.html" {
        return NamedFile::open(format!("{}/index.html", frontend_path))
            .map_err(actix_web::error::ErrorNotFound);
    }

    let file_path = format!("{}/{}", frontend_path, path);
    
    NamedFile::open(&file_path)
        .or_else(|_| NamedFile::open(format!("{}/index.html", frontend_path)))
        .map_err(actix_web::error::ErrorNotFound)
}
