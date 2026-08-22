use rand::Rng;
use sha2::{Digest, Sha256};

pub fn generate_device_id() -> String {
    let bytes: [u8; 16] = rand::thread_rng().gen();
    hex::encode(bytes)
}

pub fn generate_pairing_key(device_id: &str) -> String {
    let random_bytes: [u8; 8] = rand::thread_rng().gen();
    let mut hasher = Sha256::new();
    hasher.update(device_id.as_bytes());
    hasher.update(&random_bytes);
    let result = hasher.finalize();
    hex::encode(&result[..8])
}

pub fn generate_message_id() -> String {
    let bytes: [u8; 16] = rand::thread_rng().gen();
    hex::encode(bytes)
}

pub fn generate_file_code() -> String {
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let code: String = (0..6)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect();
    code
}

pub fn generate_token(device_id: &str) -> String {
    let bytes: [u8; 32] = rand::thread_rng().gen();
    format!("{}:{}", device_id, hex::encode(bytes))
}
