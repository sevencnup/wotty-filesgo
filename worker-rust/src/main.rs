use axum::{
    extract::Json,
    routing::post,
    Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

#[derive(Deserialize)]
struct ProcessRequest {
    filepath: String,
}

#[derive(Serialize)]
struct ProcessResponse {
    hash: String,
    size: u64,
    status: String,
}

async fn process_file(Json(payload): Json<ProcessRequest>) -> Json<ProcessResponse> {
    println!("Processing file: {}", payload.filepath);
    
    match calculate_sha256(&payload.filepath) {
        Ok((hash, size)) => Json(ProcessResponse {
            hash,
            size,
            status: "success".to_string(),
        }),
        Err(e) => Json(ProcessResponse {
            hash: String::new(),
            size: 0,
            status: format!("error: {}", e),
        }),
    }
}

fn calculate_sha256(path: &str) -> std::io::Result<(String, u64)> {
    let file = File::open(path)?;
    let len = file.metadata()?.len();
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 1024];

    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }

    let result = hasher.finalize();
    Ok((hex::encode(result), len))
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/process", post(process_file))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([127, 0, 0, 1], 8081));
    println!("Rust Worker listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
