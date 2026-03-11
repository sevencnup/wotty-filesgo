package models

type Device struct {
	ID           string    `json:"id" json:"device_id"`
	Name         string    `json:"name"`
	PublicKey     string    `json:"public_key"`
	CreatedAt    int64     `json:"created_at"`
	LastSeenAt   int64     `json:"last_seen_at"`
}

type Pairing struct {
	ID           int64  `json:"id"`
	DeviceA      string `json:"device_a"`
	DeviceB      string `json:"device_b"`
	Status       string `json:"status"`
	CreatedAt   int64  `json:"created_at"`
	AcceptedAt  *int64 `json:"accepted_at,omitempty"`
}

type Message struct {
	ID           int64  `json:"id"`
	MessageID    string `json:"message_id"`
	FromDevice   string `json:"from_device"`
	ToDevice     string `json:"to_device"`
	MessageType  string `json:"message_type"`
	Content      string `json:"content"`
	FileName     string `json:"file_name,omitempty"`
	FileSize     int64  `json:"file_size,omitempty"`
	FileCode     string `json:"file_code,omitempty"`
	Status       string `json:"status"`
	CreatedAt    int64  `json:"created_at"`
	DeliveredAt  *int64 `json:"delivered_at,omitempty"`
	ReadAt       *int64 `json:"read_at,omitempty"`
}

type FileRecord struct {
	ID           int64  `json:"id"`
	Code         string `json:"code"`
	Filename     string `json:"filename"`
	FilePath     string `json:"file_path"`
	Size         int64  `json:"size"`
	DeviceID     string `json:"device_id"`
	ExpireAt     int64  `json:"expire_at"`
	CreatedAt    int64  `json:"created_at"`
	FirstDownloadAt *int64 `json:"first_download_at,omitempty"`
}
