use crate::config::AppConfig;
use crate::crypto;
use crate::database;
use crate::handlers::{get_client_ip, increment_ip_upload_count, AppState};
use crate::models::{FileRecord, InMemoryFileRecord};
use actix_web::{web, HttpRequest, HttpResponse, Responder};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tokio::io::{AsyncWriteExt, BufReader, BufWriter};
use uuid::Uuid;

pub const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024 * 1024;
pub const DEFAULT_CHUNK_SIZE: u64 = 16 * 1024 * 1024;
const MIN_CHUNK_SIZE: u64 = 1024 * 1024;
const MAX_CHUNK_SIZE: u64 = 32 * 1024 * 1024;
const SESSION_TTL_SECONDS: i64 = 24 * 60 * 60;

#[derive(Debug, Deserialize)]
pub struct CreateUploadRequest {
    pub filename: String,
    pub size: u64,
    pub chunk_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UploadSession {
    upload_id: String,
    filename: String,
    size: u64,
    chunk_size: u64,
    total_chunks: u32,
    created_at: i64,
}

#[derive(Debug, Serialize)]
struct UploadStatusResponse {
    upload_id: String,
    filename: String,
    size: u64,
    chunk_size: u64,
    total_chunks: u32,
    uploaded_chunks: Vec<u32>,
}

fn now_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub(crate) fn is_authorized(req: &HttpRequest) -> bool {
    req.headers()
        .get("X-Upload-Password")
        .and_then(|value| value.to_str().ok())
        .map(|password| password == AppConfig::get().upload_password)
        .unwrap_or(false)
}

fn unauthorized() -> HttpResponse {
    HttpResponse::Unauthorized().json(serde_json::json!({"error": "上传密码无效"}))
}

fn normalize_upload_id(value: &str) -> Option<String> {
    Uuid::parse_str(value)
        .ok()
        .map(|id| id.hyphenated().to_string())
}

fn sessions_root() -> PathBuf {
    PathBuf::from("uploads/sessions")
}

fn session_dir(upload_id: &str) -> PathBuf {
    sessions_root().join(upload_id)
}

fn metadata_path(upload_id: &str) -> PathBuf {
    session_dir(upload_id).join("metadata.json")
}

fn chunk_path(upload_id: &str, index: u32) -> PathBuf {
    session_dir(upload_id).join(format!("{}.part", index))
}

fn read_session(upload_id: &str) -> Result<UploadSession, HttpResponse> {
    let data = fs::read(metadata_path(upload_id)).map_err(|_| {
        HttpResponse::NotFound().json(serde_json::json!({"error": "上传会话不存在或已过期"}))
    })?;
    serde_json::from_slice(&data).map_err(|_| {
        HttpResponse::InternalServerError().json(serde_json::json!({"error": "上传会话损坏"}))
    })
}

fn expected_chunk_size(session: &UploadSession, index: u32) -> Option<u64> {
    if index >= session.total_chunks {
        return None;
    }
    let offset = index as u64 * session.chunk_size;
    Some((session.size - offset).min(session.chunk_size))
}

fn uploaded_chunks(session: &UploadSession) -> Vec<u32> {
    (0..session.total_chunks)
        .filter(|index| {
            let expected = expected_chunk_size(session, *index);
            let actual = fs::metadata(chunk_path(&session.upload_id, *index))
                .ok()
                .map(|metadata| metadata.len());
            actual == expected
        })
        .collect()
}

fn status_response(session: &UploadSession) -> UploadStatusResponse {
    UploadStatusResponse {
        upload_id: session.upload_id.clone(),
        filename: session.filename.clone(),
        size: session.size,
        chunk_size: session.chunk_size,
        total_chunks: session.total_chunks,
        uploaded_chunks: uploaded_chunks(session),
    }
}

pub async fn create_upload(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<CreateUploadRequest>,
) -> impl Responder {
    if !is_authorized(&req) {
        return unauthorized();
    }

    let client_ip = get_client_ip(&req);
    if !crate::handlers::is_upload_allowed(&state.ip_upload_records, &client_ip) {
        return HttpResponse::TooManyRequests()
            .json(serde_json::json!({"error": "今日上传次数已达上限"}));
    }
    if body.size > MAX_FILE_SIZE {
        return HttpResponse::PayloadTooLarge()
            .json(serde_json::json!({"error": "文件超过 10 GB 限制"}));
    }

    let chunk_size = body.chunk_size.unwrap_or(DEFAULT_CHUNK_SIZE);
    if !(MIN_CHUNK_SIZE..=MAX_CHUNK_SIZE).contains(&chunk_size) {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({"error": "分片大小必须在 1 MB 到 32 MB 之间"}));
    }

    let filename = sanitize_filename::sanitize(&body.filename);
    if filename.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "文件名无效"}));
    }

    let upload_id = Uuid::new_v4().hyphenated().to_string();
    let total_chunks_u64 = if body.size == 0 {
        0
    } else {
        body.size.div_ceil(chunk_size)
    };
    let total_chunks = match u32::try_from(total_chunks_u64) {
        Ok(value) => value,
        Err(_) => {
            return HttpResponse::BadRequest().json(serde_json::json!({"error": "分片数量无效"}))
        }
    };
    let session = UploadSession {
        upload_id: upload_id.clone(),
        filename,
        size: body.size,
        chunk_size,
        total_chunks,
        created_at: now_timestamp(),
    };

    let dir = session_dir(&upload_id);
    if fs::create_dir_all(&dir).is_err() {
        return HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": "创建上传会话失败"}));
    }
    let metadata = match serde_json::to_vec(&session) {
        Ok(value) => value,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "创建上传会话失败"}))
        }
    };
    if fs::write(metadata_path(&upload_id), metadata).is_err() {
        fs::remove_dir_all(&dir).ok();
        return HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": "保存上传会话失败"}));
    }

    HttpResponse::Created().json(status_response(&session))
}

pub async fn get_upload_status(req: HttpRequest, path: web::Path<String>) -> impl Responder {
    if !is_authorized(&req) {
        return unauthorized();
    }
    let upload_id = match normalize_upload_id(&path) {
        Some(value) => value,
        None => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "上传会话 ID 无效"}))
        }
    };
    match read_session(&upload_id) {
        Ok(session) => HttpResponse::Ok().json(status_response(&session)),
        Err(response) => response,
    }
}

pub async fn upload_chunk(
    req: HttpRequest,
    path: web::Path<(String, u32)>,
    mut payload: web::Payload,
) -> impl Responder {
    if !is_authorized(&req) {
        return unauthorized();
    }
    let (raw_upload_id, index) = path.into_inner();
    let upload_id = match normalize_upload_id(&raw_upload_id) {
        Some(value) => value,
        None => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "上传会话 ID 无效"}))
        }
    };
    let session = match read_session(&upload_id) {
        Ok(value) => value,
        Err(response) => return response,
    };
    let expected_size = match expected_chunk_size(&session, index) {
        Some(value) => value,
        None => {
            return HttpResponse::BadRequest().json(serde_json::json!({"error": "分片索引越界"}))
        }
    };
    if req
        .headers()
        .get("Content-Length")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .is_some_and(|length| length != expected_size)
    {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "分片长度不匹配"}));
    }

    let expected_hash = match req
        .headers()
        .get("X-Chunk-SHA256")
        .and_then(|value| value.to_str().ok())
        .map(str::to_ascii_lowercase)
        .filter(|value| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
    {
        Some(value) => value,
        None => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "缺少有效的分片 SHA-256"}))
        }
    };

    let temp_path = session_dir(&upload_id).join(format!("{}.{}.uploading", index, Uuid::new_v4()));
    let file = match tokio::fs::File::create(&temp_path).await {
        Ok(value) => value,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "创建分片失败"}))
        }
    };
    let mut writer = BufWriter::new(file);
    let mut hasher = Sha256::new();
    let mut received = 0_u64;

    while let Some(item) = payload.next().await {
        let bytes = match item {
            Ok(value) => value,
            Err(_) => {
                drop(writer);
                tokio::fs::remove_file(&temp_path).await.ok();
                return HttpResponse::BadRequest()
                    .json(serde_json::json!({"error": "读取分片失败"}));
            }
        };
        received += bytes.len() as u64;
        if received > expected_size {
            drop(writer);
            tokio::fs::remove_file(&temp_path).await.ok();
            return HttpResponse::PayloadTooLarge()
                .json(serde_json::json!({"error": "分片超过预期大小"}));
        }
        hasher.update(&bytes);
        if writer.write_all(&bytes).await.is_err() {
            drop(writer);
            tokio::fs::remove_file(&temp_path).await.ok();
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "写入分片失败"}));
        }
    }

    if writer.flush().await.is_err() || received != expected_size {
        drop(writer);
        tokio::fs::remove_file(&temp_path).await.ok();
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "分片长度不匹配"}));
    }
    drop(writer);
    let actual_hash = hex::encode(hasher.finalize());
    if actual_hash != expected_hash {
        tokio::fs::remove_file(&temp_path).await.ok();
        return HttpResponse::UnprocessableEntity()
            .json(serde_json::json!({"error": "分片完整性校验失败"}));
    }

    let final_path = chunk_path(&upload_id, index);
    if tokio::fs::metadata(&final_path).await.is_ok() {
        tokio::fs::remove_file(&final_path).await.ok();
    }
    if tokio::fs::rename(&temp_path, &final_path).await.is_err() {
        tokio::fs::remove_file(&temp_path).await.ok();
        return HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": "保存分片失败"}));
    }

    HttpResponse::Ok().json(serde_json::json!({"status": "ok", "index": index}))
}

fn generate_unique_code(state: &AppState) -> String {
    loop {
        let code = crypto::generate_file_code();
        if !state.file_records.read().contains_key(&code)
            && database::get_file_record(&state.db, &code)
                .ok()
                .flatten()
                .is_none()
        {
            return code;
        }
    }
}

pub async fn complete_upload(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<String>,
) -> impl Responder {
    if !is_authorized(&req) {
        return unauthorized();
    }
    let upload_id = match normalize_upload_id(&path) {
        Some(value) => value,
        None => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "上传会话 ID 无效"}))
        }
    };
    let session = match read_session(&upload_id) {
        Ok(value) => value,
        Err(response) => return response,
    };
    if uploaded_chunks(&session).len() != session.total_chunks as usize {
        return HttpResponse::Conflict().json(serde_json::json!({"error": "仍有分片未上传完成"}));
    }

    let upload_root = PathBuf::from("uploads");
    let assembling_path = upload_root.join(format!(".{}.assembling", upload_id));
    let final_path = upload_root.join(format!("{}.file", upload_id));
    let output = match tokio::fs::File::create(&assembling_path).await {
        Ok(value) => value,
        Err(_) => {
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "创建目标文件失败"}))
        }
    };
    let mut writer = BufWriter::new(output);
    let mut total_size = 0_u64;
    for index in 0..session.total_chunks {
        let input = match tokio::fs::File::open(chunk_path(&upload_id, index)).await {
            Ok(value) => value,
            Err(_) => {
                drop(writer);
                tokio::fs::remove_file(&assembling_path).await.ok();
                return HttpResponse::Conflict()
                    .json(serde_json::json!({"error": "分片缺失，请续传后重试"}));
            }
        };
        let mut reader = BufReader::new(input);
        match tokio::io::copy(&mut reader, &mut writer).await {
            Ok(copied) => total_size += copied,
            Err(_) => {
                drop(writer);
                tokio::fs::remove_file(&assembling_path).await.ok();
                return HttpResponse::InternalServerError()
                    .json(serde_json::json!({"error": "合并文件失败"}));
            }
        }
    }
    if writer.flush().await.is_err() || total_size != session.size {
        drop(writer);
        tokio::fs::remove_file(&assembling_path).await.ok();
        return HttpResponse::UnprocessableEntity()
            .json(serde_json::json!({"error": "合并后的文件大小不匹配"}));
    }
    drop(writer);
    if tokio::fs::rename(&assembling_path, &final_path)
        .await
        .is_err()
    {
        tokio::fs::remove_file(&assembling_path).await.ok();
        return HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": "完成上传失败"}));
    }

    let config = AppConfig::get();
    let code = generate_unique_code(&state);
    let now = now_timestamp();
    let expire_at = now + config.retention.initial_hours * 3600;
    let mut database_record = FileRecord {
        id: 0,
        code: code.clone(),
        filename: session.filename.clone(),
        file_path: final_path.to_string_lossy().to_string(),
        size: session.size as i64,
        device_id: None,
        expire_at,
        created_at: now,
        first_download_at: None,
    };
    if database::save_file_record(&state.db, &mut database_record).is_err() {
        tokio::fs::remove_file(&final_path).await.ok();
        return HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": "保存文件记录失败"}));
    }
    state.file_records.write().insert(
        code.clone(),
        InMemoryFileRecord {
            filename: session.filename.clone(),
            file_path: final_path.to_string_lossy().to_string(),
            size: session.size as i64,
            code: code.clone(),
            expire_at,
            created_at: now,
            uploaded_at: now,
            first_download_at: None,
        },
    );
    increment_ip_upload_count(&state.ip_upload_records, &get_client_ip(&req));
    tokio::fs::remove_dir_all(session_dir(&upload_id))
        .await
        .ok();

    HttpResponse::Ok().json(serde_json::json!({
        "code": code,
        "filename": session.filename,
        "size": session.size,
        "expire_at": chrono::DateTime::from_timestamp(expire_at, 0)
            .map(|value| value.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default(),
        "download_url": format!("{}/?code={}", state.server_addr, code),
    }))
}

pub async fn cancel_upload(req: HttpRequest, path: web::Path<String>) -> impl Responder {
    if !is_authorized(&req) {
        return unauthorized();
    }
    let upload_id = match normalize_upload_id(&path) {
        Some(value) => value,
        None => {
            return HttpResponse::BadRequest()
                .json(serde_json::json!({"error": "上传会话 ID 无效"}))
        }
    };
    match tokio::fs::remove_dir_all(session_dir(&upload_id)).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"status": "cancelled"})),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            HttpResponse::Ok().json(serde_json::json!({"status": "already_removed"}))
        }
        Err(_) => HttpResponse::InternalServerError()
            .json(serde_json::json!({"error": "清理上传会话失败"})),
    }
}

pub fn cleanup_stale_sessions() {
    let root = sessions_root();
    let entries = match fs::read_dir(&root) {
        Ok(value) => value,
        Err(_) => return,
    };
    let now = now_timestamp();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let metadata = path.join("metadata.json");
        let is_stale = fs::read(metadata)
            .ok()
            .and_then(|data| serde_json::from_slice::<UploadSession>(&data).ok())
            .map(|session| now - session.created_at > SESSION_TTL_SECONDS)
            .unwrap_or(true);
        if is_stale {
            fs::remove_dir_all(path).ok();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(size: u64, chunk_size: u64) -> UploadSession {
        UploadSession {
            upload_id: Uuid::new_v4().to_string(),
            filename: "test.bin".to_string(),
            size,
            chunk_size,
            total_chunks: if size == 0 {
                0
            } else {
                size.div_ceil(chunk_size) as u32
            },
            created_at: 0,
        }
    }

    #[test]
    fn calculates_last_chunk_size() {
        let value = session(33, 16);
        assert_eq!(expected_chunk_size(&value, 0), Some(16));
        assert_eq!(expected_chunk_size(&value, 1), Some(16));
        assert_eq!(expected_chunk_size(&value, 2), Some(1));
        assert_eq!(expected_chunk_size(&value, 3), None);
    }

    #[test]
    fn only_accepts_uuid_session_ids() {
        let id = Uuid::new_v4().to_string();
        assert_eq!(normalize_upload_id(&id), Some(id));
        assert_eq!(normalize_upload_id("../uploads"), None);
    }

    #[test]
    fn ten_gibibytes_is_the_hard_limit() {
        assert_eq!(MAX_FILE_SIZE, 10_737_418_240);
    }
}
