use crate::models::{Device, FileRecord, Message};
use rusqlite::{Connection, Result as SqliteResult};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

pub type DbPool = Arc<Mutex<Connection>>;

pub fn init_db(db_path: &str) -> SqliteResult<DbPool> {
    let conn = Connection::open(db_path)?;
    create_tables(&conn)?;
    Ok(Arc::new(Mutex::new(conn)))
}

fn create_tables(conn: &Connection) -> SqliteResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            public_key TEXT,
            created_at INTEGER,
            last_seen_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS pairings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_a TEXT NOT NULL,
            device_b TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at INTEGER,
            accepted_at INTEGER,
            UNIQUE(device_a, device_b)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            from_device TEXT NOT NULL,
            to_device TEXT NOT NULL,
            message_type TEXT NOT NULL,
            content TEXT,
            file_name TEXT,
            file_size INTEGER,
            file_code TEXT,
            status TEXT DEFAULT 'sent',
            created_at INTEGER,
            delivered_at INTEGER,
            read_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS file_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            size INTEGER,
            device_id TEXT,
            expire_at INTEGER,
            created_at INTEGER,
            first_download_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_pairings_device_a ON pairings(device_a);
        CREATE INDEX IF NOT EXISTS idx_pairings_device_b ON pairings(device_b);
        CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_device);
        CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_device);
        CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
        "#,
    )?;
    Ok(())
}

fn now_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

pub fn register_device(pool: &DbPool, device_id: &str, name: &str, public_key: Option<&str>) -> SqliteResult<()> {
    let now = now_timestamp();
    let conn = pool.lock().unwrap();
    conn.execute(
        r#"
        INSERT INTO devices (id, name, public_key, created_at, last_seen_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET name = ?2, last_seen_at = ?5
        "#,
        rusqlite::params![device_id, name, public_key, now, now],
    )?;
    Ok(())
}

pub fn get_device(pool: &DbPool, device_id: &str) -> SqliteResult<Option<Device>> {
    let conn = pool.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, public_key, created_at, last_seen_at FROM devices WHERE id = ?1"
    )?;
    
    let device = stmt.query_row(rusqlite::params![device_id], |row| {
        Ok(Device {
            id: row.get(0)?,
            name: row.get(1)?,
            public_key: row.get(2)?,
            created_at: row.get(3)?,
            last_seen_at: row.get(4)?,
        })
    }).ok();
    
    Ok(device)
}

pub fn update_device_name(pool: &DbPool, device_id: &str, name: &str) -> SqliteResult<()> {
    let conn = pool.lock().unwrap();
    conn.execute(
        "UPDATE devices SET name = ?1 WHERE id = ?2",
        rusqlite::params![name, device_id],
    )?;
    Ok(())
}

pub fn update_device_last_seen(pool: &DbPool, device_id: &str) -> SqliteResult<()> {
    let now = now_timestamp();
    let conn = pool.lock().unwrap();
    conn.execute(
        "UPDATE devices SET last_seen_at = ?1 WHERE id = ?2",
        rusqlite::params![now, device_id],
    )?;
    Ok(())
}

pub fn create_pairing_request(pool: &DbPool, device_a: &str, device_b: &str) -> SqliteResult<()> {
    let now = now_timestamp();
    let conn = pool.lock().unwrap();
    conn.execute(
        "INSERT INTO pairings (device_a, device_b, status, created_at) VALUES (?1, ?2, 'pending', ?3)",
        rusqlite::params![device_a, device_b, now],
    )?;
    Ok(())
}

pub fn accept_pairing(pool: &DbPool, pairing_id: i64) -> SqliteResult<()> {
    let now = now_timestamp();
    let conn = pool.lock().unwrap();
    conn.execute(
        "UPDATE pairings SET status = 'accepted', accepted_at = ?1 WHERE id = ?2",
        rusqlite::params![now, pairing_id],
    )?;
    Ok(())
}

pub fn reject_pairing(pool: &DbPool, pairing_id: i64) -> SqliteResult<()> {
    let conn = pool.lock().unwrap();
    conn.execute(
        "UPDATE pairings SET status = 'rejected' WHERE id = ?1",
        rusqlite::params![pairing_id],
    )?;
    Ok(())
}

pub fn delete_pairing(pool: &DbPool, device_a: &str, device_b: &str) -> SqliteResult<()> {
    let conn = pool.lock().unwrap();
    conn.execute(
        "DELETE FROM pairings WHERE (device_a = ?1 AND device_b = ?2) OR (device_a = ?2 AND device_b = ?1)",
        rusqlite::params![device_a, device_b],
    )?;
    Ok(())
}

pub fn get_paired_devices(pool: &DbPool, device_id: &str) -> SqliteResult<Vec<serde_json::Value>> {
    let conn = pool.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"
        SELECT d.id, d.name, d.last_seen_at, p.status
        FROM pairings p
        JOIN devices d ON (d.id = p.device_a OR d.id = p.device_b)
        WHERE (p.device_a = ?1 OR p.device_b = ?1)
        AND p.status = 'accepted'
        AND d.id != ?1
        "#
    )?;
    
    let devices = stmt.query_map(rusqlite::params![device_id], |row| {
        Ok(serde_json::json!({
            "device_id": row.get::<_, String>(0)?,
            "name": row.get::<_, String>(1)?,
            "last_seen_at": row.get::<_, i64>(2)?,
            "status": row.get::<_, String>(3)?,
        }))
    })?.collect::<Result<Vec<_>, _>>()?;
    
    Ok(devices)
}

pub fn get_pending_pairing_requests(pool: &DbPool, device_id: &str) -> SqliteResult<Vec<serde_json::Value>> {
    let conn = pool.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"
        SELECT p.id, p.device_a, d.name
        FROM pairings p
        JOIN devices d ON d.id = p.device_a
        WHERE p.device_b = ?1 AND p.status = 'pending'
        "#
    )?;
    
    let requests = stmt.query_map(rusqlite::params![device_id], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "device_id": row.get::<_, String>(1)?,
            "name": row.get::<_, String>(2)?,
        }))
    })?.collect::<Result<Vec<_>, _>>()?;
    
    Ok(requests)
}

pub fn save_message(pool: &DbPool, msg: &mut Message) -> SqliteResult<()> {
    let now = now_timestamp();
    let conn = pool.lock().unwrap();
    let result = conn.execute(
        r#"
        INSERT INTO messages (message_id, from_device, to_device, message_type, content, file_name, file_size, file_code, status, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'sent', ?9)
        "#,
        rusqlite::params![
            msg.message_id,
            msg.from_device,
            msg.to_device,
            msg.message_type,
            msg.content,
            msg.file_name,
            msg.file_size,
            msg.file_code,
            now
        ],
    )?;
    msg.id = conn.last_insert_rowid();
    msg.created_at = now;
    Ok(())
}

pub fn update_message_status(pool: &DbPool, message_id: &str, status: &str) -> SqliteResult<()> {
    let now = now_timestamp();
    let conn = pool.lock().unwrap();
    let query = match status {
        "delivered" => "UPDATE messages SET status = ?1, delivered_at = ?2 WHERE message_id = ?3",
        "read" => "UPDATE messages SET status = ?1, read_at = ?2 WHERE message_id = ?3",
        _ => "UPDATE messages SET status = ?1 WHERE message_id = ?3",
    };
    
    if status == "delivered" || status == "read" {
        conn.execute(query, rusqlite::params![status, now, message_id])?;
    } else {
        conn.execute("UPDATE messages SET status = ?1 WHERE message_id = ?2", rusqlite::params![status, message_id])?;
    }
    Ok(())
}

pub fn get_messages(pool: &DbPool, device_id: &str, limit: i32, offset: i32) -> SqliteResult<Vec<Message>> {
    let conn = pool.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"
        SELECT id, message_id, from_device, to_device, message_type, content, file_name, file_size, file_code, status, created_at, delivered_at, read_at
        FROM messages 
        WHERE from_device = ?1 OR to_device = ?1
        ORDER BY created_at DESC
        LIMIT ?2 OFFSET ?3
        "#
    )?;
    
    let messages = stmt.query_map(rusqlite::params![device_id, limit, offset], |row| {
        Ok(Message {
            id: row.get(0)?,
            message_id: row.get(1)?,
            from_device: row.get(2)?,
            to_device: row.get(3)?,
            message_type: row.get(4)?,
            content: row.get(5)?,
            file_name: row.get(6)?,
            file_size: row.get(7)?,
            file_code: row.get(8)?,
            status: row.get(9)?,
            created_at: row.get(10)?,
            delivered_at: row.get(11)?,
            read_at: row.get(12)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    
    Ok(messages)
}

pub fn get_conversation_messages(pool: &DbPool, device_a: &str, device_b: &str, limit: i32, offset: i32) -> SqliteResult<Vec<Message>> {
    let conn = pool.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"
        SELECT id, message_id, from_device, to_device, message_type, content, file_name, file_size, file_code, status, created_at, delivered_at, read_at
        FROM messages 
        WHERE (from_device = ?1 AND to_device = ?2) OR (from_device = ?2 AND to_device = ?1)
        ORDER BY created_at ASC
        LIMIT ?3 OFFSET ?4
        "#
    )?;
    
    let messages = stmt.query_map(rusqlite::params![device_a, device_b, limit, offset], |row| {
        Ok(Message {
            id: row.get(0)?,
            message_id: row.get(1)?,
            from_device: row.get(2)?,
            to_device: row.get(3)?,
            message_type: row.get(4)?,
            content: row.get(5)?,
            file_name: row.get(6)?,
            file_size: row.get(7)?,
            file_code: row.get(8)?,
            status: row.get(9)?,
            created_at: row.get(10)?,
            delivered_at: row.get(11)?,
            read_at: row.get(12)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    
    Ok(messages)
}

pub fn save_file_record(pool: &DbPool, record: &mut FileRecord) -> SqliteResult<()> {
    let now = now_timestamp();
    let conn = pool.lock().unwrap();
    conn.execute(
        r#"
        INSERT INTO file_records (code, filename, file_path, size, device_id, expire_at, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        rusqlite::params![
            record.code,
            record.filename,
            record.file_path,
            record.size,
            record.device_id,
            record.expire_at,
            now
        ],
    )?;
    record.id = conn.last_insert_rowid();
    record.created_at = now;
    Ok(())
}

pub fn get_file_record(pool: &DbPool, code: &str) -> SqliteResult<Option<FileRecord>> {
    let conn = pool.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, code, filename, file_path, size, device_id, expire_at, created_at, first_download_at FROM file_records WHERE code = ?1"
    )?;
    
    let record = stmt.query_row(rusqlite::params![code], |row| {
        Ok(FileRecord {
            id: row.get(0)?,
            code: row.get(1)?,
            filename: row.get(2)?,
            file_path: row.get(3)?,
            size: row.get(4)?,
            device_id: row.get(5)?,
            expire_at: row.get(6)?,
            created_at: row.get(7)?,
            first_download_at: row.get(8)?,
        })
    }).ok();
    
    Ok(record)
}

pub fn update_file_first_download(pool: &DbPool, code: &str) -> SqliteResult<()> {
    let now = now_timestamp();
    let conn = pool.lock().unwrap();
    conn.execute(
        "UPDATE file_records SET first_download_at = ?1 WHERE code = ?2",
        rusqlite::params![now, code],
    )?;
    Ok(())
}

pub fn delete_file_record(pool: &DbPool, code: &str) -> SqliteResult<()> {
    let conn = pool.lock().unwrap();
    conn.execute("DELETE FROM file_records WHERE code = ?1", rusqlite::params![code])?;
    Ok(())
}

pub fn cleanup_expired_files(pool: &DbPool) -> SqliteResult<Vec<String>> {
    let now = now_timestamp();
    let conn = pool.lock().unwrap();
    
    let mut stmt = conn.prepare("SELECT file_path FROM file_records WHERE expire_at < ?1")?;
    let paths: Vec<String> = stmt.query_map(rusqlite::params![now], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    
    conn.execute("DELETE FROM file_records WHERE expire_at < ?1", rusqlite::params![now])?;
    
    Ok(paths)
}

pub fn get_unread_message_count(pool: &DbPool, device_id: &str) -> SqliteResult<i32> {
    let conn = pool.lock().unwrap();
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM messages WHERE to_device = ?1 AND status = 'sent'",
        rusqlite::params![device_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn get_device_id_by_key(pool: &DbPool, key: &str) -> SqliteResult<Option<String>> {
    let conn = pool.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id FROM devices WHERE id = ?1 OR public_key = ?1")?;
    let device_id = stmt.query_row(rusqlite::params![key], |row| row.get(0)).ok();
    Ok(device_id)
}
