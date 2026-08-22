use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use rand::Rng;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

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

// ---------------------------------------------------------------------------
// Server-side encryption at rest: AES-256-GCM, per-file DEK, master-key envelope
// ---------------------------------------------------------------------------

pub const FILE_MAGIC: &[u8; 4] = b"FGO1";
pub const FILE_HEADER_LEN: usize = 88;
const WRAPPED_DEK_LEN: usize = 48; // 32B ciphertext + 16B GCM tag

pub struct FileHeader {
    pub segment_size: u32,
    pub total_size: u64,
    pub base_nonce: [u8; 12],
    pub dek: [u8; 32],
}

static MASTER_KEY: OnceLock<[u8; 32]> = OnceLock::new();

fn decode_hex_to_32(hex_str: &str) -> Option<[u8; 32]> {
    let trimmed = hex_str.trim();
    if trimmed.len() != 64 || !trimmed.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let mut key = [0u8; 32];
    for (i, slot) in key.iter_mut().enumerate() {
        *slot = u8::from_str_radix(&trimmed[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(key)
}

/// Loads the master key from FILESGO_MASTER_KEY (64 hex chars), else from
/// uploads/master.key, else generates and persists a fresh one.
pub fn ensure_master_key() -> Result<(), String> {
    if let Ok(value) = std::env::var("FILESGO_MASTER_KEY") {
        if let Some(key) = decode_hex_to_32(&value) {
            let _ = MASTER_KEY.set(key);
            log::info!("Master key loaded from FILESGO_MASTER_KEY");
            return Ok(());
        }
        return Err("FILESGO_MASTER_KEY 必须是 64 位十六进制（32 字节）".to_string());
    }

    let path = PathBuf::from("uploads/master.key");
    if let Ok(content) = fs::read_to_string(&path) {
        if let Some(key) = decode_hex_to_32(&content) {
            let _ = MASTER_KEY.set(key);
            log::info!("Master key loaded from uploads/master.key");
            return Ok(());
        }
    }

    let key: [u8; 32] = rand::thread_rng().gen();
    if let Err(error) = fs::create_dir_all("uploads").and_then(|_| fs::write(&path, hex::encode(key))) {
        return Err(format!("写入主密钥文件失败: {error}"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    let _ = MASTER_KEY.set(key);
    log::warn!("生成了新的主密钥并保存到 uploads/master.key；生产环境建议改用 FILESGO_MASTER_KEY");
    Ok(())
}

fn master_key() -> &'static [u8; 32] {
    MASTER_KEY.get().expect("master key has not been initialized")
}

pub fn wrap_dek(dek: &[u8; 32]) -> ([u8; 12], Vec<u8>) {
    let nonce: [u8; 12] = rand::thread_rng().gen();
    let cipher = Aes256Gcm::new_from_slice(master_key()).expect("invalid master key length");
    let wrapped = cipher
        .encrypt(Nonce::from_slice(&nonce), dek.as_slice())
        .expect("failed to wrap data key");
    (nonce, wrapped)
}

fn unwrap_dek(nonce: &[u8; 12], wrapped: &[u8]) -> Result<[u8; 32], String> {
    let cipher = Aes256Gcm::new_from_slice(master_key()).expect("invalid master key length");
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce), wrapped)
        .map_err(|_| "无法解包文件密钥，主密钥可能已更换".to_string())?;
    plaintext
        .try_into()
        .map_err(|_| "解包后的文件密钥长度异常".to_string())
}

fn segment_nonce(base: &[u8; 12], index: u32) -> [u8; 12] {
    let mut nonce = *base;
    nonce[0..4].copy_from_slice(&index.to_be_bytes());
    nonce
}

pub fn encrypt_segment(dek: &[u8; 32], base: &[u8; 12], index: u32, plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(dek).map_err(|error| error.to_string())?;
    cipher
        .encrypt(Nonce::from_slice(&segment_nonce(base, index)), plaintext)
        .map_err(|error| format!("AES-GCM 加密失败: {error}"))
}

pub fn decrypt_segment(dek: &[u8; 32], base: &[u8; 12], index: u32, ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(dek).map_err(|error| error.to_string())?;
    cipher
        .decrypt(Nonce::from_slice(&segment_nonce(base, index)), ciphertext)
        .map_err(|_| "文件解密失败：取件码文件可能已损坏或密钥不匹配".to_string())
}

pub fn header_bytes(
    segment_size: u32,
    total_size: u64,
    base_nonce: &[u8; 12],
    wrap_nonce: &[u8; 12],
    wrapped_dek: &[u8],
) -> Vec<u8> {
    let mut header = Vec::with_capacity(FILE_HEADER_LEN);
    header.extend_from_slice(FILE_MAGIC);
    header.extend_from_slice(&segment_size.to_be_bytes());
    header.extend_from_slice(&total_size.to_be_bytes());
    header.extend_from_slice(base_nonce);
    header.extend_from_slice(wrap_nonce);
    header.extend_from_slice(wrapped_dek);
    header
}

/// Parses a file header. Returns Ok(None) when the bytes are not a FilesGO
/// encrypted file (legacy plaintext), and Err on a corrupt/foreign header.
pub fn parse_header(bytes: &[u8]) -> Result<Option<FileHeader>, String> {
    if bytes.len() < FILE_HEADER_LEN || bytes[0..4] != *FILE_MAGIC {
        return Ok(None);
    }
    let segment_size = u32::from_be_bytes(bytes[4..8].try_into().unwrap());
    let total_size = u64::from_be_bytes(bytes[8..16].try_into().unwrap());
    if segment_size == 0 {
        return Err("文件头分片大小为 0".to_string());
    }
    let base_nonce: [u8; 12] = bytes[16..28].try_into().map_err(|_| "文件头 nonce 长度异常")?;
    let wrap_nonce: [u8; 12] = bytes[28..40].try_into().map_err(|_| "文件头 nonce 长度异常")?;
    let wrapped: [u8; WRAPPED_DEK_LEN] = bytes[40..FILE_HEADER_LEN].try_into().map_err(|_| "文件头密钥字段损坏")?;
    let dek = unwrap_dek(&wrap_nonce, &wrapped)?;
    Ok(Some(FileHeader {
        segment_size,
        total_size,
        base_nonce,
        dek,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_round_trip() {
        let dek: [u8; 32] = [7u8; 32];
        let base: [u8; 12] = [9u8; 12];
        let plaintext = b"hello filesgo encryption";
        let ct = encrypt_segment(&dek, &base, 3, plaintext).unwrap();
        assert_eq!(ct.len(), plaintext.len() + 16);
        let pt = decrypt_segment(&dek, &base, 3, &ct).unwrap();
        assert_eq!(pt, plaintext);
    }

    #[test]
    fn different_indexes_produce_different_ciphertexts() {
        let dek: [u8; 32] = [1u8; 32];
        let base: [u8; 12] = [2u8; 12];
        let a = encrypt_segment(&dek, &base, 0, b"payload").unwrap();
        let b = encrypt_segment(&dek, &base, 1, b"payload").unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn wrong_key_fails_decryption() {
        let dek: [u8; 32] = [5u8; 32];
        let base: [u8; 12] = [6u8; 12];
        let ct = encrypt_segment(&dek, &base, 0, b"secret").unwrap();
        let wrong: [u8; 32] = [8u8; 32];
        assert!(decrypt_segment(&wrong, &base, 0, &ct).is_err());
    }

    #[test]
    fn multi_segment_round_trip() {
        std::env::set_var("FILESGO_MASTER_KEY", hex::encode([1u8; 32]));
        ensure_master_key().unwrap();
        let segment_size = 2 * 1024 * 1024;
        let total = 5 * 1024 * 1024 + 17;

        let mut plaintext = Vec::new();
        let mut seed: u8 = 0;
        while plaintext.len() < total {
            plaintext.push(seed);
            seed = seed.wrapping_add(1);
        }
        let dek: [u8; 32] = rand::random();
        let base: [u8; 12] = rand::random();

        let mut disk = Vec::new();
        let (wrap_nonce, wrapped) = wrap_dek(&dek);
        let header = header_bytes(segment_size as u32, total as u64, &base, &wrap_nonce, &wrapped);
        disk.extend_from_slice(&header);

        let full = total / segment_size;
        for i in 0..full {
            let ct = encrypt_segment(&dek, &base, i as u32, &plaintext[i * segment_size..(i + 1) * segment_size]).unwrap();
            disk.extend_from_slice(&ct);
        }
        let rem = total % segment_size;
        if rem > 0 {
            let ct = encrypt_segment(&dek, &base, full as u32, &plaintext[full * segment_size..]).unwrap();
            disk.extend_from_slice(&ct);
        }

        let parsed = parse_header(&disk[..FILE_HEADER_LEN]).unwrap().unwrap();
        assert_eq!(parsed.segment_size, segment_size as u32);
        assert_eq!(parsed.total_size, total as u64);

        let mut out = Vec::with_capacity(total);
        let mut cursor = FILE_HEADER_LEN;
        let full_segments = parsed.total_size / parsed.segment_size as u64;
        let remainder = (parsed.total_size % parsed.segment_size as u64) as usize;
        for index in 0..full_segments {
            let end = cursor + parsed.segment_size as usize + 16;
            let pt = decrypt_segment(&parsed.dek, &parsed.base_nonce, index as u32, &disk[cursor..end]).unwrap();
            out.extend_from_slice(&pt);
            cursor = end;
        }
        if remainder > 0 {
            let pt = decrypt_segment(&parsed.dek, &parsed.base_nonce, full_segments as u32, &disk[cursor..]).unwrap();
            out.extend_from_slice(&pt);
        }
        assert_eq!(out.len(), total);
        assert_eq!(out, plaintext);
    }

    #[test]
    fn header_round_trip() {
        std::env::set_var("FILESGO_MASTER_KEY", hex::encode([2u8; 32]));
        ensure_master_key().unwrap();
        let dek: [u8; 32] = [3u8; 32];
        let base: [u8; 12] = [4u8; 12];
        let (wrap_nonce, wrapped) = wrap_dek(&dek);
        assert_eq!(wrapped.len(), WRAPPED_DEK_LEN);
        let bytes = header_bytes(16 * 1024 * 1024, 12345, &base, &wrap_nonce, &wrapped);
        assert_eq!(bytes.len(), FILE_HEADER_LEN);
        let parsed = parse_header(&bytes).unwrap().unwrap();
        assert_eq!(parsed.segment_size, 16 * 1024 * 1024);
        assert_eq!(parsed.total_size, 12345);
        assert_eq!(parsed.base_nonce, base);
        assert_eq!(parsed.dek, dek);
    }

    #[test]
    fn legacy_plaintext_header_detected_as_none() {
        // 旧明文文件无 FGO1 头：应返回 Ok(None)，走 NamedFile 直传
        let empty = parse_header(&[]).unwrap();
        assert!(empty.is_none());
        let short = parse_header(&[0u8; 20]).unwrap();
        assert!(short.is_none());
        let legacy = parse_header(&b"not-a-filesgo-encrypted-file.........".to_vec()).unwrap();
        assert!(legacy.is_none());
    }
}
