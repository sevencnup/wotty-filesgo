use actix_multipart::Multipart;
use actix_web::{web, HttpRequest, HttpResponse, Responder};
use actix_web_actors::ws;
use crate::config::AppConfig;
use crate::crypto;
use crate::database::{self, DbPool};
use crate::models::*;
use crate::websocket::{HubActor, WsClientSession};
use actix::Addr;
use chrono::Datelike;
use futures_util::StreamExt;
use parking_lot::RwLock;
use sanitize_filename::sanitize;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

pub type FileRecords = Arc<RwLock<HashMap<String, InMemoryFileRecord>>>;
pub type IpUploadRecords = Arc<RwLock<HashMap<String, IpUploadRecord>>>;

pub struct AppState {
    pub db: DbPool,
    pub hub: Addr<HubActor>,
    pub file_records: FileRecords,
    pub ip_upload_records: IpUploadRecords,
    pub server_addr: String,
}

fn now_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn get_client_ip(req: &HttpRequest) -> String {
    if let Some(forwarded) = req.headers().get("X-Forwarded-For") {
        if let Ok(forwarded_str) = forwarded.to_str() {
            if let Some(ip) = forwarded_str.split(',').next() {
                return ip.trim().to_string();
            }
        }
    }
    if let Some(real_ip) = req.headers().get("X-Real-IP") {
        if let Ok(ip) = real_ip.to_str() {
            return ip.to_string();
        }
    }
    req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn is_same_day(t1: i64, t2: i64) -> bool {
    let dt1 = chrono::DateTime::from_timestamp(t1, 0).unwrap_or_default();
    let dt2 = chrono::DateTime::from_timestamp(t2, 0).unwrap_or_default();
    dt1.year() == dt2.year() && dt1.month() == dt2.month() && dt1.day() == dt2.day()
}

pub async fn verify_password(
    _state: web::Data<AppState>,
    body: web::Json<VerifyPasswordRequest>,
) -> impl Responder {
    let config = AppConfig::get();
    if body.password == config.upload_password {
        HttpResponse::Ok().json(serde_json::json!({"valid": true}))
    } else {
        HttpResponse::Unauthorized().json(serde_json::json!({"valid": false, "error": "密码错误"}))
    }
}

pub async fn upload_file(
    state: web::Data<AppState>,
    req: HttpRequest,
    mut payload: Multipart,
) -> impl Responder {
    let config = AppConfig::get();
    
    while let Some(item) = payload.next().await {
        let mut field = match item {
            Ok(f) => f,
            Err(e) => {
                log::error!("[UPLOAD] Multipart error: {}", e);
                return HttpResponse::BadRequest().json(serde_json::json!({"error": "获取上传文件失败"}));
            }
        };

        let content_disposition = field.content_disposition();
        let filename = content_disposition
            .get_filename()
            .map(|f| sanitize(f))
            .unwrap_or_else(|| "unknown".to_string());

        log::info!("[UPLOAD] Received file: {}", filename);

        let upload_dir = PathBuf::from("uploads");
        if !upload_dir.exists() {
            fs::create_dir_all(&upload_dir).ok();
        }

        let filepath = upload_dir.join(&filename);
        let mut f = match File::create(&filepath) {
            Ok(f) => f,
            Err(e) => {
                log::error!("[UPLOAD] Failed to create file: {}", e);
                return HttpResponse::InternalServerError().json(serde_json::json!({"error": "文件保存失败"}));
            }
        };

        let mut total_size: i64 = 0;
        while let Some(chunk) = field.next().await {
            let data = match chunk {
                Ok(d) => d,
                Err(e) => {
                    log::error!("[UPLOAD] Chunk error: {}", e);
                    return HttpResponse::InternalServerError().json(serde_json::json!({"error": "读取数据失败"}));
                }
            };
            total_size += data.len() as i64;
            if f.write_all(&data).is_err() {
                return HttpResponse::InternalServerError().json(serde_json::json!({"error": "写入文件失败"}));
            }
        }

        let code = generate_unique_code(&state.file_records);
        let now = now_timestamp();
        let expire_at = now + config.retention.initial_hours * 3600;

        state.file_records.write().insert(
            code.clone(),
            InMemoryFileRecord {
                filename: filename.clone(),
                file_path: filepath.to_string_lossy().to_string(),
                size: total_size,
                code: code.clone(),
                expire_at,
                created_at: now,
                uploaded_at: now,
                first_download_at: None,
            },
        );

        let client_ip = get_client_ip(&req);
        increment_ip_upload_count(&state.ip_upload_records, &client_ip);

        log::info!("[UPLOAD] Upload success - code: {}, IP: {}", code, client_ip);

        return HttpResponse::Ok().json(serde_json::json!({
            "code": code,
            "filename": filename,
            "size": total_size,
            "expire_at": chrono::DateTime::from_timestamp(expire_at, 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                .unwrap_or_default(),
            "download_url": format!("{}/?code={}", state.server_addr, code),
        }));
    }

    HttpResponse::BadRequest().json(serde_json::json!({"error": "没有上传文件"}))
}

fn generate_unique_code(file_records: &FileRecords) -> String {
    loop {
        let code = crypto::generate_file_code();
        if !file_records.read().contains_key(&code) {
            return code;
        }
    }
}

fn increment_ip_upload_count(ip_records: &IpUploadRecords, client_ip: &str) {
    let mut records = ip_records.write();
    let now = now_timestamp();
    
    let record = records.entry(client_ip.to_string()).or_insert(IpUploadRecord {
        count: 0,
        last_upload: now,
    });

    if !is_same_day(record.last_upload, now) {
        record.count = 0;
    }
    
    record.count += 1;
    record.last_upload = now;
}

pub async fn upload_chunk(
    _state: web::Data<AppState>,
    req: HttpRequest,
    mut payload: Multipart,
) -> impl Responder {
    let query: std::collections::HashMap<String, String> = req.query_string()
        .split('&')
        .filter_map(|s| {
            let mut parts = s.splitn(2, '=');
            let key = parts.next()?.to_string();
            let value = parts.next().map(|v| urlencoding::decode(v).ok().unwrap_or_default().to_string()).unwrap_or_default();
            Some((key, value))
        })
        .collect();
    let identifier = query.get("identifier").cloned().unwrap_or_default();
    let index = query.get("index").cloned().unwrap_or_default();

    if identifier.is_empty() || index.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "缺少参数"}));
    }

    let chunk_dir = PathBuf::from("uploads/chunks").join(&identifier);
    if !chunk_dir.exists() {
        fs::create_dir_all(&chunk_dir).ok();
    }

    while let Some(item) = payload.next().await {
        let mut field = match item {
            Ok(f) => f,
            Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "获取分片失败"})),
        };

        let chunk_path = chunk_dir.join(&index);
        let mut f = match File::create(&chunk_path) {
            Ok(f) => f,
            Err(_) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": "创建分片文件失败"})),
        };

        while let Some(chunk) = field.next().await {
            if let Ok(data) = chunk {
                if f.write_all(&data).is_err() {
                    return HttpResponse::InternalServerError().json(serde_json::json!({"error": "写入分片失败"}));
                }
            }
        }
    }

    HttpResponse::Ok().json(serde_json::json!({"status": "ok"}))
}

pub async fn upload_complete(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<UploadCompleteRequest>,
) -> impl Responder {
    let upload_dir = PathBuf::from("uploads");
    let mut dst = upload_dir.join(&body.filename);

    if dst.exists() {
        let ext = PathBuf::from(&body.filename)
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        let name_only = body.filename.trim_end_matches(&ext);
        dst = upload_dir.join(format!("{}_{}{}", name_only, now_timestamp(), ext));
    }

    let mut final_file = match File::create(&dst) {
        Ok(f) => f,
        Err(_) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": "创建目标文件失败"})),
    };

    let chunk_dir = PathBuf::from("uploads/chunks").join(&body.identifier);
    let mut total_size: i64 = 0;

    for i in 0..body.total_chunks {
        let chunk_path = chunk_dir.join(i.to_string());
        match fs::read(&chunk_path) {
            Ok(data) => {
                total_size += data.len() as i64;
                if final_file.write_all(&data).is_err() {
                    return HttpResponse::InternalServerError().json(serde_json::json!({"error": "合并文件失败"}));
                }
            }
            Err(_) => {
                return HttpResponse::InternalServerError()
                    .json(serde_json::json!({"error": format!("读取分片 {} 失败", i)}));
            }
        }
    }

    fs::remove_dir_all(&chunk_dir).ok();

    let config = AppConfig::get();
    let code = generate_unique_code(&state.file_records);
    let now = now_timestamp();
    let expire_at = now + config.retention.initial_hours * 3600;

    state.file_records.write().insert(
        code.clone(),
        InMemoryFileRecord {
            filename: dst.file_name().unwrap().to_string_lossy().to_string(),
            file_path: dst.to_string_lossy().to_string(),
            size: total_size,
            code: code.clone(),
            expire_at,
            created_at: now,
            uploaded_at: now,
            first_download_at: None,
        },
    );

    let client_ip = get_client_ip(&req);
    increment_ip_upload_count(&state.ip_upload_records, &client_ip);

    HttpResponse::Ok().json(serde_json::json!({
        "code": code,
        "filename": dst.file_name().unwrap().to_string_lossy(),
        "size": total_size,
        "expire_at": chrono::DateTime::from_timestamp(expire_at, 0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default(),
        "download_url": format!("{}/?code={}", state.server_addr, code),
    }))
}

pub async fn get_file_info(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    let code = path.to_uppercase();
    let records = state.file_records.read();
    
    if let Some(record) = records.get(&code) {
        let now = now_timestamp();
        if now > record.expire_at {
            return HttpResponse::NotFound().json(serde_json::json!({"error": "文件不存在或已过期"}));
        }
        
        HttpResponse::Ok().json(serde_json::json!({
            "code": record.code,
            "filename": record.filename,
            "size": record.size,
            "expire_at": chrono::DateTime::from_timestamp(record.expire_at, 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                .unwrap_or_default(),
        }))
    } else {
        HttpResponse::NotFound().json(serde_json::json!({"error": "文件不存在或已过期"}))
    }
}

pub async fn download_file(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    let code = path.to_uppercase();
    let now = now_timestamp();
    
    {
        let mut records = state.file_records.write();
        if let Some(record) = records.get_mut(&code) {
            if now > record.expire_at {
                return HttpResponse::NotFound().json(serde_json::json!({"error": "文件不存在或已过期"}));
            }
            
            if record.first_download_at.is_none() {
                let config = AppConfig::get();
                record.first_download_at = Some(now);
                record.expire_at = now + config.retention.after_download_hours * 3600;
                log::info!("文件 {} 首次被访问，将于 {} 小时后销毁", code, config.retention.after_download_hours);
            }
        } else {
            return HttpResponse::NotFound().json(serde_json::json!({"error": "文件不存在或已过期"}));
        }
    }
    
    let records = state.file_records.read();
    if let Some(record) = records.get(&code) {
        match fs::read(&record.file_path) {
            Ok(data) => {
                let filename = urlencoding::encode(&record.filename);
                HttpResponse::Ok()
                    .content_type("application/octet-stream")
                    .insert_header(("Content-Length", record.size))
                    .insert_header(("Content-Disposition", 
                        format!("attachment; filename=\"{}\"; filename*=UTF-8''{}", 
                            record.filename, filename)))
                    .body(data)
            }
            Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "文件打开失败"}))
        }
    } else {
        HttpResponse::NotFound().json(serde_json::json!({"error": "文件不存在或已过期"}))
    }
}

pub async fn delete_file(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> impl Responder {
    let code = path.to_uppercase();
    let mut records = state.file_records.write();
    
    if let Some(record) = records.remove(&code) {
        fs::remove_file(&record.file_path).ok();
    }
    
    HttpResponse::Ok().json(serde_json::json!({"message": "文件已销毁"}))
}

pub async fn register_device(
    state: web::Data<AppState>,
    body: web::Json<RegisterDeviceRequest>,
) -> impl Responder {
    let device_id = body.device_id.clone().unwrap_or_else(crypto::generate_device_id);
    let device_name = body.device_name.clone().unwrap_or_else(|| format!("Device-{}", &device_id[..8]));
    let public_key = body.public_key.clone();

    let token = crypto::generate_token(&device_id);

    if database::register_device(&state.db, &device_id, &device_name, public_key.as_deref()).is_err() {
        return HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to register device"}));
    }

    HttpResponse::Ok().json(RegisterDeviceResponse {
        device_id,
        token,
    })
}

pub async fn get_device_info(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    match database::get_device(&state.db, device_id) {
        Ok(Some(device)) => HttpResponse::Ok().json(device),
        _ => HttpResponse::NotFound().json(serde_json::json!({"error": "Device not found"})),
    }
}

pub async fn update_device_name(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<UpdateDeviceNameRequest>,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if database::update_device_name(&state.db, device_id, &body.name).is_err() {
        return HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to update device name"}));
    }

    HttpResponse::Ok().json(serde_json::json!({"message": "Device name updated"}))
}

pub async fn generate_pairing_key(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let pairing_key = crypto::generate_pairing_key(device_id);
    HttpResponse::Ok().json(serde_json::json!({"pairing_key": pairing_key}))
}

pub async fn request_pairing(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<PairingRequest>,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if device_id.is_empty() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
    }

    let target_device_id = match database::get_device_id_by_key(&state.db, &body.target_key) {
        Ok(Some(id)) => id,
        _ => return HttpResponse::NotFound().json(serde_json::json!({"error": "Target device not found"})),
    };

    if target_device_id == device_id {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "Cannot pair with yourself"}));
    }

    if database::create_pairing_request(&state.db, &device_id, &target_device_id).is_err() {
        return HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to create pairing request"}));
    }

    if let Ok(Some(requester)) = database::get_device(&state.db, device_id) {
        let msg = WSMessage {
            msg_type: "pairing_request".to_string(),
            from_device: Some(device_id.to_string()),
            to_device: Some(target_device_id.clone()),
            content: Some(requester.name),
            message_id: None,
            message_type: None,
            status: None,
            timestamp: Some(now_timestamp()),
            file_name: None,
            file_size: None,
            file_code: None,
        };
        state.hub.do_send(crate::websocket::SendToDevice {
            device_id: target_device_id,
            message: msg,
        });
    }

    HttpResponse::Ok().json(serde_json::json!({"message": "Pairing request sent"}))
}

pub async fn accept_pairing(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<AcceptPairingRequest>,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if device_id.is_empty() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
    }

    if database::accept_pairing(&state.db, body.pairing_id).is_err() {
        return HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to accept pairing"}));
    }

    HttpResponse::Ok().json(serde_json::json!({"message": "Pairing accepted"}))
}

pub async fn reject_pairing(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<RejectPairingRequest>,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if device_id.is_empty() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
    }

    if database::reject_pairing(&state.db, body.pairing_id).is_err() {
        return HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to reject pairing"}));
    }

    HttpResponse::Ok().json(serde_json::json!({"message": "Pairing rejected"}))
}

pub async fn get_paired_devices(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    match database::get_paired_devices(&state.db, device_id) {
        Ok(devices) => HttpResponse::Ok().json(devices),
        Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to get paired devices"})),
    }
}

pub async fn delete_pairing(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<String>,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if device_id.is_empty() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
    }

    let target_device_id = path.into_inner();

    if database::delete_pairing(&state.db, &device_id, &target_device_id).is_err() {
        return HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to delete pairing"}));
    }

    HttpResponse::Ok().json(serde_json::json!({"message": "Pairing deleted"}))
}

pub async fn get_pending_pairing_requests(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if device_id.is_empty() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
    }

    match database::get_pending_pairing_requests(&state.db, device_id) {
        Ok(requests) => HttpResponse::Ok().json(requests),
        Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to get pending requests"})),
    }
}

pub async fn get_messages(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let query: std::collections::HashMap<String, String> = req.query_string()
        .split('&')
        .filter_map(|s| {
            let mut parts = s.splitn(2, '=');
            let key = parts.next()?.to_string();
            let value = parts.next().map(|v| urlencoding::decode(v).ok().unwrap_or_default().to_string()).unwrap_or_default();
            Some((key, value))
        })
        .collect();
    let target_device_id = query.get("target_device_id").cloned().unwrap_or_default();

    let messages = if !target_device_id.is_empty() {
        database::get_conversation_messages(&state.db, device_id, &target_device_id, 50, 0)
    } else {
        database::get_messages(&state.db, device_id, 50, 0)
    };

    match messages {
        Ok(msgs) => HttpResponse::Ok().json(msgs),
        Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to get messages"})),
    }
}

pub async fn send_message(
    state: web::Data<AppState>,
    req: HttpRequest,
    body: web::Json<SendMessageRequest>,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if device_id.is_empty() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
    }

    if body.to_device.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "Target device required"}));
    }

    let mut msg = Message {
        id: 0,
        message_id: crypto::generate_message_id(),
        from_device: device_id.to_string(),
        to_device: body.to_device.clone(),
        message_type: body.message_type.clone(),
        content: body.content.clone(),
        file_name: body.file_name.clone(),
        file_size: body.file_size,
        file_code: body.file_code.clone(),
        status: "sent".to_string(),
        created_at: 0,
        delivered_at: None,
        read_at: None,
    };

    if database::save_message(&state.db, &mut msg).is_err() {
        return HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to save message"}));
    }

    let ws_msg = WSMessage {
        msg_type: body.message_type.clone(),
        from_device: Some(device_id.to_string()),
        to_device: Some(body.to_device.clone()),
        content: body.content.clone(),
        message_id: Some(msg.message_id.clone()),
        message_type: Some(body.message_type.clone()),
        status: None,
        timestamp: Some(msg.created_at),
        file_name: body.file_name.clone(),
        file_size: body.file_size,
        file_code: body.file_code.clone(),
    };

    state.hub.do_send(crate::websocket::SendToDevice {
        device_id: body.to_device.clone(),
        message: ws_msg,
    });

    database::update_message_status(&state.db, &msg.message_id, "delivered").ok();
    msg.status = "delivered".to_string();

    HttpResponse::Ok().json(msg)
}

pub async fn update_message_status(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<String>,
    body: web::Json<UpdateStatusRequest>,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if device_id.is_empty() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "Unauthorized"}));
    }

    let message_id = path.into_inner();

    if database::update_message_status(&state.db, &message_id, &body.status).is_err() {
        return HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to update message status"}));
    }

    HttpResponse::Ok().json(serde_json::json!({"message": "Status updated"}))
}

pub async fn get_unread_count(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> impl Responder {
    let device_id = req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    match database::get_unread_message_count(&state.db, device_id) {
        Ok(count) => HttpResponse::Ok().json(serde_json::json!({"unread_count": count})),
        Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to get unread count"})),
    }
}

pub async fn websocket_route(
    req: HttpRequest,
    stream: web::Payload,
    state: web::Data<AppState>,
) -> impl Responder {
    let query: std::collections::HashMap<String, String> = req.query_string()
        .split('&')
        .filter_map(|s| {
            let mut parts = s.splitn(2, '=');
            let key = parts.next()?.to_string();
            let value = parts.next().map(|v| urlencoding::decode(v).ok().unwrap_or_default().to_string()).unwrap_or_default();
            Some((key, value))
        })
        .collect();
    let device_id = query.get("device_id").cloned().unwrap_or_default();
    let device_name = query.get("device_name").cloned().unwrap_or_default();

    if device_id.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "device_id required"}));
    }

    database::update_device_last_seen(&state.db, &device_id).ok();

    let client = WsClientSession {
        device_id,
        device_name,
        hub: state.hub.clone(),
    };

    match ws::start(client, &req, stream) {
        Ok(response) => response,
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}
