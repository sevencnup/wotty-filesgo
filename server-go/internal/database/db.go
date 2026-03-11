package database

import (
	"database/sql"
	"sync"
	"time"

	"filesgo/internal/models"

	_ "github.com/mattn/go-sqlite3"
)

var (
	db     *sql.DB
	dbOnce sync.Once
)

func InitDB(dbPath string) error {
	var err error
	dbOnce.Do(func() {
		db, err = sql.Open("sqlite3", dbPath)
		if err != nil {
			return
		}
		err = createTables()
	})
	return err
}

func GetDB() *sql.DB {
	return db
}

func createTables() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS devices (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			public_key TEXT,
			created_at INTEGER,
			last_seen_at INTEGER
		)`,
		`CREATE TABLE IF NOT EXISTS pairings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			device_a TEXT NOT NULL,
			device_b TEXT NOT NULL,
			status TEXT DEFAULT 'pending',
			created_at INTEGER,
			accepted_at INTEGER,
			UNIQUE(device_a, device_b)
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
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
		)`,
		`CREATE TABLE IF NOT EXISTS file_records (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			code TEXT UNIQUE NOT NULL,
			filename TEXT NOT NULL,
			file_path TEXT NOT NULL,
			size INTEGER,
			device_id TEXT,
			expire_at INTEGER,
			created_at INTEGER,
			first_download_at INTEGER
		)`,
		`CREATE INDEX IF NOT EXISTS idx_pairings_device_a ON pairings(device_a)`,
		`CREATE INDEX IF NOT EXISTS idx_pairings_device_b ON pairings(device_b)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_device)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_device)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)`,
	}

	for _, query := range queries {
		if _, err := db.Exec(query); err != nil {
			return err
		}
	}
	return nil
}

func RegisterDevice(deviceID, name, publicKey string) error {
	now := time.Now().Unix()
	_, err := db.Exec(`
		INSERT INTO devices (id, name, public_key, created_at, last_seen_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET name = ?, last_seen_at = ?
	`, deviceID, name, publicKey, now, now, name, now)
	return err
}

func GetDevice(deviceID string) (*models.Device, error) {
	device := &models.Device{}
	err := db.QueryRow(`
		SELECT id, name, public_key, created_at, last_seen_at
		FROM devices WHERE id = ?
	`, deviceID).Scan(&device.ID, &device.Name, &device.PublicKey, &device.CreatedAt, &device.LastSeenAt)
	if err != nil {
		return nil, err
	}
	return device, nil
}

func UpdateDeviceName(deviceID, name string) error {
	_, err := db.Exec(`UPDATE devices SET name = ? WHERE id = ?`, name, deviceID)
	return err
}

func UpdateDeviceLastSeen(deviceID string) error {
	_, err := db.Exec(`UPDATE devices SET last_seen_at = ? WHERE id = ?`, time.Now().Unix(), deviceID)
	return err
}

func CreatePairingRequest(deviceA, deviceB string) error {
	now := time.Now().Unix()
	_, err := db.Exec(`
		INSERT INTO pairings (device_a, device_b, status, created_at)
		VALUES (?, ?, 'pending', ?)
	`, deviceA, deviceB, now)
	return err
}

func AcceptPairing(id int64) error {
	now := time.Now().Unix()
	_, err := db.Exec(`
		UPDATE pairings SET status = 'accepted', accepted_at = ? WHERE id = ?
	`, now, id)
	return err
}

func RejectPairing(id int64) error {
	_, err := db.Exec(`UPDATE pairings SET status = 'rejected' WHERE id = ?`, id)
	return err
}

func DeletePairing(deviceA, deviceB string) error {
	_, err := db.Exec(`
		DELETE FROM pairings 
		WHERE (device_a = ? AND device_b = ?) OR (device_a = ? AND device_b = ?)
	`, deviceA, deviceB, deviceB, deviceA)
	return err
}

func GetPairedDevices(deviceID string) ([]map[string]interface{}, error) {
	rows, err := db.Query(`
		SELECT d.id, d.name, d.last_seen_at, p.status
		FROM pairings p
		JOIN devices d ON (d.id = p.device_a OR d.id = p.device_b)
		WHERE (p.device_a = ? OR p.device_b = ?) 
		AND p.status = 'accepted'
		AND d.id != ?
	`, deviceID, deviceID, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	devices := []map[string]interface{}{}
	for rows.Next() {
		var id, name, status string
		var lastSeen int64
		if err := rows.Scan(&id, &name, &lastSeen, &status); err != nil {
			return nil, err
		}
		devices = append(devices, map[string]interface{}{
			"device_id":    id,
			"name":         name,
			"last_seen_at": lastSeen,
			"status":       status,
		})
	}
	return devices, nil
}

func GetPendingPairingRequests(deviceID string) ([]map[string]interface{}, error) {
	rows, err := db.Query(`
		SELECT p.id, p.device_a, d.name
		FROM pairings p
		JOIN devices d ON d.id = p.device_a
		WHERE p.device_b = ? AND p.status = 'pending'
	`, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := []map[string]interface{}{}
	for rows.Next() {
		var id int64
		var deviceA, name string
		if err := rows.Scan(&id, &deviceA, &name); err != nil {
			return nil, err
		}
		requests = append(requests, map[string]interface{}{
			"id":        id,
			"device_id": deviceA,
			"name":      name,
		})
	}
	return requests, nil
}

func SaveMessage(msg *models.Message) error {
	now := time.Now().Unix()
	result, err := db.Exec(`
		INSERT INTO messages (message_id, from_device, to_device, message_type, content, file_name, file_size, file_code, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)
	`, msg.MessageID, msg.FromDevice, msg.ToDevice, msg.MessageType, msg.Content, msg.FileName, msg.FileSize, msg.FileCode, now)
	if err != nil {
		return err
	}
	id, _ := result.LastInsertId()
	msg.ID = id
	msg.CreatedAt = now
	return nil
}

func UpdateMessageStatus(messageID string, status string) error {
	now := time.Now().Unix()
	var query string
	switch status {
	case "delivered":
		query = `UPDATE messages SET status = ?, delivered_at = ? WHERE message_id = ?`
	case "read":
		query = `UPDATE messages SET status = ?, read_at = ? WHERE message_id = ?`
	default:
		query = `UPDATE messages SET status = ? WHERE message_id = ?`
		return nil
	}
	_, err := db.Exec(query, status, now, messageID)
	return err
}

func GetMessages(deviceID string, limit, offset int) ([]models.Message, error) {
	rows, err := db.Query(`
		SELECT id, message_id, from_device, to_device, message_type, content, file_name, file_size, file_code, status, created_at, delivered_at, read_at
		FROM messages 
		WHERE from_device = ? OR to_device = ?
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, deviceID, deviceID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []models.Message{}
	for rows.Next() {
		var msg models.Message
		var deliveredAt, readAt sql.NullInt64
		if err := rows.Scan(&msg.ID, &msg.MessageID, &msg.FromDevice, &msg.ToDevice, &msg.MessageType, &msg.Content, &msg.FileName, &msg.FileSize, &msg.FileCode, &msg.Status, &msg.CreatedAt, &deliveredAt, &readAt); err != nil {
			return nil, err
		}
		if deliveredAt.Valid {
			msg.DeliveredAt = &deliveredAt.Int64
		}
		if readAt.Valid {
			msg.ReadAt = &readAt.Int64
		}
		messages = append(messages, msg)
	}
	return messages, nil
}

func GetConversationMessages(deviceA, deviceB string, limit, offset int) ([]models.Message, error) {
	rows, err := db.Query(`
		SELECT id, message_id, from_device, to_device, message_type, content, file_name, file_size, file_code, status, created_at, delivered_at, read_at
		FROM messages 
		WHERE (from_device = ? AND to_device = ?) OR (from_device = ? AND to_device = ?)
		ORDER BY created_at ASC
		LIMIT ? OFFSET ?
	`, deviceA, deviceB, deviceB, deviceA, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []models.Message{}
	for rows.Next() {
		var msg models.Message
		var deliveredAt, readAt sql.NullInt64
		if err := rows.Scan(&msg.ID, &msg.MessageID, &msg.FromDevice, &msg.ToDevice, &msg.MessageType, &msg.Content, &msg.FileName, &msg.FileSize, &msg.FileCode, &msg.Status, &msg.CreatedAt, &deliveredAt, &readAt); err != nil {
			return nil, err
		}
		if deliveredAt.Valid {
			msg.DeliveredAt = &deliveredAt.Int64
		}
		if readAt.Valid {
			msg.ReadAt = &readAt.Int64
		}
		messages = append(messages, msg)
	}
	return messages, nil
}

func SaveFileRecord(record *models.FileRecord) error {
	now := time.Now().Unix()
	result, err := db.Exec(`
		INSERT INTO file_records (code, filename, file_path, size, device_id, expire_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, record.Code, record.Filename, record.FilePath, record.Size, record.DeviceID, record.ExpireAt, now)
	if err != nil {
		return err
	}
	id, _ := result.LastInsertId()
	record.ID = id
	record.CreatedAt = now
	return nil
}

func GetFileRecord(code string) (*models.FileRecord, error) {
	record := &models.FileRecord{}
	var firstDownload sql.NullInt64
	err := db.QueryRow(`
		SELECT id, code, filename, file_path, size, device_id, expire_at, created_at, first_download_at
		FROM file_records WHERE code = ?
	`, code).Scan(&record.ID, &record.Code, &record.Filename, &record.FilePath, &record.Size, &record.DeviceID, &record.ExpireAt, &record.CreatedAt, &firstDownload)
	if err != nil {
		return nil, err
	}
	if firstDownload.Valid {
		record.FirstDownloadAt = &firstDownload.Int64
	}
	return record, nil
}

func UpdateFileFirstDownload(code string) error {
	now := time.Now().Unix()
	_, err := db.Exec(`UPDATE file_records SET first_download_at = ? WHERE code = ?`, now, code)
	return err
}

func DeleteFileRecord(code string) error {
	_, err := db.Exec(`DELETE FROM file_records WHERE code = ?`, code)
	return err
}

func CleanupExpiredFiles() ([]string, error) {
	now := time.Now().Unix()
	rows, err := db.Query(`SELECT file_path FROM file_records WHERE expire_at < ?`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	paths := []string{}
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			return nil, err
		}
		paths = append(paths, path)
	}

	_, err = db.Exec(`DELETE FROM file_records WHERE expire_at < ?`, now)
	return paths, err
}

func GetUnreadMessageCount(deviceID string) (int, error) {
	var count int
	err := db.QueryRow(`
		SELECT COUNT(*) FROM messages 
		WHERE to_device = ? AND status = 'sent'
	`, deviceID).Scan(&count)
	return count, err
}
