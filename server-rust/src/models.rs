use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub public_key: Option<String>,
    pub created_at: i64,
    pub last_seen_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pairing {
    pub id: i64,
    pub device_a: String,
    pub device_b: String,
    pub status: String,
    pub created_at: i64,
    pub accepted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: i64,
    pub message_id: String,
    pub from_device: String,
    pub to_device: String,
    pub message_type: String,
    pub content: Option<String>,
    pub file_name: Option<String>,
    pub file_size: Option<i64>,
    pub file_code: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub delivered_at: Option<i64>,
    pub read_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub id: i64,
    pub code: String,
    pub filename: String,
    pub file_path: String,
    pub size: i64,
    pub device_id: Option<String>,
    pub expire_at: i64,
    pub created_at: i64,
    pub first_download_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InMemoryFileRecord {
    pub filename: String,
    pub file_path: String,
    pub size: i64,
    pub code: String,
    pub expire_at: i64,
    pub created_at: i64,
    pub uploaded_at: i64,
    pub first_download_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpUploadRecord {
    pub count: i32,
    pub last_upload: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WSMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_device: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_device: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterDeviceRequest {
    pub device_id: Option<String>,
    pub device_name: Option<String>,
    pub public_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterDeviceResponse {
    pub device_id: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDeviceNameRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingRequest {
    pub target_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub to_device: String,
    pub message_type: String,
    pub content: Option<String>,
    pub file_name: Option<String>,
    pub file_size: Option<i64>,
    pub file_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadCompleteRequest {
    pub identifier: String,
    pub filename: String,
    pub total_chunks: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateStatusRequest {
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptPairingRequest {
    pub pairing_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RejectPairingRequest {
    pub pairing_id: i64,
}
