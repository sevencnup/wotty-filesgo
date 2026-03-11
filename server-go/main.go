package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"filesgo/internal/database"
	"filesgo/internal/handlers"
	"filesgo/internal/models"
	"filesgo/internal/websocket"

	"github.com/gin-gonic/gin"
	gorillaws "github.com/gorilla/websocket"
	_ "github.com/mattn/go-sqlite3"
	"gopkg.in/yaml.v3"
)

type Config struct {
	UploadPassword string `yaml:"upload_password"`
	Server         struct {
		Port string `yaml:"port"`
	} `yaml:"server"`
	Retention struct {
		InitialHours       int `yaml:"initial_hours"`
		AfterDownloadHours int `yaml:"after_download_hours"`
		MaxLifetimeHours   int `yaml:"max_lifetime_hours"`
	} `yaml:"retention"`
	RateLimit struct {
		MaxUploadsPerDay int `yaml:"max_uploads_per_day"`
	} `yaml:"rate_limit"`
}

type FileRecord struct {
	Filename        string
	FilePath        string
	Size            int64
	Code            string
	ExpireAt        time.Time
	CreatedAt       time.Time
	UploadedAt      time.Time
	FirstDownloadAt *time.Time
}

type IPUploadRecord struct {
	Count      int
	LastUpload time.Time
}

var (
	config          Config
	fileRecords     map[string]FileRecord
	ipUploadRecords map[string]IPUploadRecord
	mu              sync.RWMutex
	serverAddr      string
	hub             *websocket.Hub
	db              *sql.DB
)

func generateCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	seededRand := rand.New(rand.NewSource(time.Now().UnixNano()))
	b := make([]byte, 6)
	for i := range b {
		b[i] = charset[seededRand.Intn(len(charset))]
	}
	return string(b)
}

func loadConfig() {
	configFile := "config.yaml"
	data, err := os.ReadFile(configFile)
	if err != nil {
		log.Printf("警告：无法读取配置文件 %s，使用默认配置：%v", configFile, err)
		config.UploadPassword = "filesgo123"
		config.Server.Port = "8080"
		config.Retention.InitialHours = 24
		config.Retention.AfterDownloadHours = 2
		return
	}

	if err := yaml.Unmarshal(data, &config); err != nil {
		log.Printf("警告：配置文件解析失败，使用默认配置：%v", err)
		config.UploadPassword = "filesgo123"
		config.Server.Port = "8080"
		config.Retention.InitialHours = 24
		config.Retention.AfterDownloadHours = 2
		return
	}

	if config.UploadPassword == "" {
		config.UploadPassword = "filesgo123"
		log.Println("警告：配置文件中未设置上传密码，已使用默认密码：filesgo123")
	}
	if config.Server.Port == "" {
		config.Server.Port = "8080"
	}
	if config.Retention.InitialHours <= 0 {
		config.Retention.InitialHours = 24
	}
	if config.Retention.AfterDownloadHours <= 0 {
		config.Retention.AfterDownloadHours = 2
	}
	if config.Retention.MaxLifetimeHours <= 0 {
		config.Retention.MaxLifetimeHours = 2
	}
	if config.RateLimit.MaxUploadsPerDay <= 0 {
		config.RateLimit.MaxUploadsPerDay = 2
	}

	log.Printf("配置加载成功，上传密码已配置，每日上传限制: %d次", config.RateLimit.MaxUploadsPerDay)
}

func getDownloadURL(code string) string {
	return serverAddr + "/?code=" + code
}

var upgrader = gorillaws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func handleWebSocket(c *gin.Context) {
	deviceID := c.Query("device_id")
	deviceName := c.Query("device_name")

	if deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id required"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &websocket.Client{
		DeviceID:   deviceID,
		DeviceName: deviceName,
		Conn:       conn,
		Send:       make(chan []byte, 256),
		Hub:        hub,
	}

	hub.Register <- client

	database.UpdateDeviceLastSeen(deviceID)

	go client.WritePump()
	client.ReadPump(func(message []byte) {
		var msg websocket.WSMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			return
		}

		msg.FromDevice = deviceID
		msg.Timestamp = time.Now().Unix()

		switch msg.Type {
		case websocket.MessageTypeText, websocket.MessageTypeFile, websocket.MessageTypeImage:
			dbMsg := &models.Message{
				MessageID:   msg.MessageID,
				FromDevice:  deviceID,
				ToDevice:    msg.ToDevice,
				MessageType: string(msg.MessageType),
				Content:     msg.Content,
				FileName:    msg.FileName,
				FileSize:    msg.FileSize,
				FileCode:    msg.FileCode,
			}
			database.SaveMessage(dbMsg)
			msg.MessageID = dbMsg.MessageID
			msg.Timestamp = dbMsg.CreatedAt

			if hub.SendToDevice(msg.ToDevice, mustMarshal(msg)) {
				database.UpdateMessageStatus(msg.MessageID, "delivered")
			}

		case websocket.MessageTypeMessageStatus:
			database.UpdateMessageStatus(msg.MessageID, msg.Status)
			if msg.ToDevice != "" {
				hub.SendToDevice(msg.ToDevice, mustMarshal(msg))
			}

		case websocket.MessageTypePong:
			database.UpdateDeviceLastSeen(deviceID)
		}
	})
}

func mustMarshal(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}

func main() {
	loadConfig()

	gin.SetMode(gin.ReleaseMode)
	fileRecords = make(map[string]FileRecord)
	ipUploadRecords = make(map[string]IPUploadRecord)

	if err := database.InitDB("filesgo.db"); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	db = database.GetDB()

	hub = websocket.NewHub()
	go hub.Run()

	port := os.Getenv("PORT")
	if port == "" {
		port = config.Server.Port
	}

	serverAddr = os.Getenv("SERVER_ADDR")
	if serverAddr == "" {
		serverAddr = "http://103.69.128.25:8080"
	}

	go startCleanupTask()

	if _, err := os.Stat("uploads"); os.IsNotExist(err) {
		os.Mkdir("uploads", 0755)
	}

	r := gin.Default()
	r.MaxMultipartMemory = 64 << 20

	distFS, err := getFrontendFS()
	if err != nil {
		log.Fatal("Failed to load embedded assets:", err)
	}

	r.Use(func(c *gin.Context) {
		if distFS != nil && c.Request.URL.Path == "/" {
			f, err := distFS.Open("index.html")
			if err == nil {
				defer f.Close()
				content, _ := io.ReadAll(f)
				c.Data(http.StatusOK, "text/html; charset=utf-8", content)
				c.Abort()
				return
			}
		}

		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Device-ID, X-Device-Token")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		deviceID := c.GetHeader("X-Device-ID")
		c.Set("device_id", deviceID)

		c.Next()
	})

	r.GET("/", func(c *gin.Context) {
		if distFS == nil {
			c.String(http.StatusNotFound, "Not Found")
			return
		}
		c.FileFromFS("index.html", http.FS(distFS))
	})

	r.GET("/graphic", func(c *gin.Context) {
		if distFS == nil {
			c.String(http.StatusNotFound, "Not Found")
			return
		}
		c.FileFromFS("index.html", http.FS(distFS))
	})

	r.GET("/ws", handleWebSocket)

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		if strings.HasPrefix(path, "/api") {
			c.JSON(http.StatusNotFound, gin.H{"error": "API route not found"})
			return
		}

		if distFS == nil {
			c.String(http.StatusNotFound, "Not Found")
			return
		}

		filePath := strings.TrimPrefix(path, "/")
		if filePath == "" {
			filePath = "index.html"
		}

		f, err := distFS.Open(filePath)
		if err == nil {
			defer f.Close()
			stat, err := f.Stat()
			if err == nil && !stat.IsDir() {
				content, _ := io.ReadAll(f)
				ext := filepath.Ext(filePath)
				contentType := "application/octet-stream"
				switch ext {
				case ".html":
					contentType = "text/html; charset=utf-8"
				case ".js":
					contentType = "application/javascript"
				case ".css":
					contentType = "text/css"
				case ".png":
					contentType = "image/png"
				case ".ico":
					contentType = "image/x-icon"
				}
				c.Data(http.StatusOK, contentType, content)
				return
			}
		}

		f, err = distFS.Open("index.html")
		if err == nil {
			defer f.Close()
			content, _ := io.ReadAll(f)
			c.Data(http.StatusOK, "text/html; charset=utf-8", content)
			return
		}

		c.String(http.StatusNotFound, "Not Found")
	})

	h := handlers.NewHandlers(db, hub)

	api := r.Group("/api")
	{
		api.POST("/verify-password", verifyPasswordHandler)

		api.POST("/upload", passwordAuthMiddleware(), ipLimitMiddleware(), uploadHandler)
		api.POST("/upload/chunk", passwordAuthMiddleware(), ipLimitMiddleware(), uploadChunkHandler)
		api.POST("/upload/complete", passwordAuthMiddleware(), ipLimitMiddleware(), uploadCompleteHandler)
		api.GET("/file/:code", getFileInfoHandler)
		api.GET("/download/:code", downloadByCodeHandler)
		api.DELETE("/file/:code", deleteFileHandler)

		api.POST("/device/register", h.RegisterDevice)
		api.GET("/device/info", h.GetDeviceInfo)
		api.PUT("/device/name", h.UpdateDeviceName)

		api.POST("/pairing/generate-key", h.GeneratePairingKey)
		api.POST("/pairing/request", h.RequestPairing)
		api.POST("/pairing/accept", h.AcceptPairing)
		api.POST("/pairing/reject", h.RejectPairing)
		api.GET("/pairing/list", h.GetPairedDevices)
		api.GET("/pairing/pending", h.GetPendingPairingRequests)
		api.DELETE("/pairing/:device_id", h.DeletePairing)

		api.GET("/messages", h.GetMessages)
		api.POST("/message/send", h.SendMessage)
		api.PUT("/message/:message_id/status", h.UpdateMessageStatus)
		api.GET("/messages/unread", h.GetUnreadCount)
	}

	log.Println("Server running on http://localhost:" + port)
	log.Println("WebSocket endpoint: ws://localhost:" + port + "/ws")
	r.Run(":" + port)
}

func deleteFileHandler(c *gin.Context) {
	code := strings.ToUpper(c.Param("code"))
	mu.Lock()
	record, exists := fileRecords[code]
	if exists {
		os.Remove(record.FilePath)
		delete(fileRecords, code)
	}
	mu.Unlock()
	c.JSON(http.StatusOK, gin.H{"message": "文件已销毁"})
}

func passwordAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		password := c.GetHeader("X-Upload-Password")
		if password == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "请先输入上传密码"})
			c.Abort()
			return
		}

		if password != config.UploadPassword {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "密码错误"})
			c.Abort()
			return
		}

		c.Next()
	}
}

func getClientIP(c *gin.Context) string {
	forwarded := c.GetHeader("X-Forwarded-For")
	if forwarded != "" {
		ips := strings.Split(forwarded, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}

	realIP := c.GetHeader("X-Real-IP")
	if realIP != "" {
		return realIP
	}

	return c.ClientIP()
}

func ipLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if config.RateLimit.MaxUploadsPerDay <= 0 {
			c.Next()
			return
		}

		clientIP := getClientIP(c)
		now := time.Now()

		mu.Lock()
		record, exists := ipUploadRecords[clientIP]

		if exists && !isSameDay(record.LastUpload, now) {
			record.Count = 0
		}

		if record.Count >= config.RateLimit.MaxUploadsPerDay {
			mu.Unlock()
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": fmt.Sprintf("今日上传次数已达上限(%d次)，请明天再试", config.RateLimit.MaxUploadsPerDay),
			})
			c.Abort()
			return
		}
		mu.Unlock()

		c.Next()
	}
}

func isSameDay(t1, t2 time.Time) bool {
	return t1.Year() == t2.Year() && t1.Month() == t2.Month() && t1.Day() == t2.Day()
}

func incrementIPUploadCount(clientIP string) {
	mu.Lock()
	defer mu.Unlock()

	record, exists := ipUploadRecords[clientIP]
	now := time.Now()

	if !exists || !isSameDay(record.LastUpload, now) {
		ipUploadRecords[clientIP] = IPUploadRecord{
			Count:      1,
			LastUpload: now,
		}
	} else {
		record.Count++
		record.LastUpload = now
		ipUploadRecords[clientIP] = record
	}
}

func verifyPasswordHandler(c *gin.Context) {
	var req struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求"})
		return
	}

	if req.Password == config.UploadPassword {
		c.JSON(http.StatusOK, gin.H{"valid": true})
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{"valid": false, "error": "密码错误"})
	}
}

func startCleanupTask() {
	ticker := time.NewTicker(1 * time.Minute)
	for range ticker.C {
		mu.Lock()
		now := time.Now()
		for code, record := range fileRecords {
			shouldDelete := false
			deleteReason := ""

			maxLifetime := record.UploadedAt.Add(time.Duration(config.Retention.MaxLifetimeHours) * time.Hour)
			if now.After(maxLifetime) {
				shouldDelete = true
				deleteReason = fmt.Sprintf("超过最大存活时间(%d小时)", config.Retention.MaxLifetimeHours)
			} else if now.After(record.ExpireAt) {
				shouldDelete = true
				deleteReason = "已过期"
			}

			if shouldDelete {
				os.Remove(record.FilePath)
				delete(fileRecords, code)
				log.Printf("Cleaned up file: %s, 原因: %s", code, deleteReason)
			}
		}
		mu.Unlock()

		paths, err := database.CleanupExpiredFiles()
		if err == nil {
			for _, path := range paths {
				os.Remove(path)
			}
		}
	}
}

func uploadHandler(c *gin.Context) {
	log.Printf("[UPLOAD] 开始处理 - 长度: %d", c.Request.ContentLength)
	const MaxFileSize = 10 * 1024 * 1024 * 1024
	if c.Request.ContentLength > MaxFileSize {
		log.Printf("[UPLOAD] 文件过大: %d", c.Request.ContentLength)
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "文件过大，限制 10GB"})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxFileSize+1024)

	file, err := c.FormFile("file")
	if err != nil {
		log.Printf("[UPLOAD] FormFile 错误: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "获取上传文件失败: " + err.Error()})
		return
	}

	log.Printf("[UPLOAD] 收到文件: %s, 大小: %d", file.Filename, file.Size)

	absPath, _ := filepath.Abs("uploads")
	dst := filepath.Join(absPath, file.Filename)
	if err := c.SaveUploadedFile(file, dst); err != nil {
		log.Printf("[UPLOAD] 保存失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "文件保存失败: " + err.Error()})
		return
	}

	code := generateCode()
	for {
		mu.RLock()
		_, exists := fileRecords[code]
		mu.RUnlock()
		if !exists {
			break
		}
		code = generateCode()
	}

	now := time.Now()
	mu.Lock()
	fileRecords[code] = FileRecord{
		Filename:   file.Filename,
		FilePath:   dst,
		Size:       file.Size,
		Code:       code,
		ExpireAt:   now.Add(time.Duration(config.Retention.InitialHours) * time.Hour),
		CreatedAt:  now,
		UploadedAt: now,
	}
	mu.Unlock()

	incrementIPUploadCount(getClientIP(c))

	log.Printf("[UPLOAD] 上传成功 - 取件码: %s, IP: %s", code, getClientIP(c))

	c.JSON(http.StatusOK, gin.H{
		"code":         code,
		"filename":     file.Filename,
		"size":         file.Size,
		"expire_at":    time.Now().Add(time.Duration(config.Retention.InitialHours) * time.Hour).Format("2006-01-02 15:04:05"),
		"download_url": fmt.Sprintf("%s://%s/?code=%s", getScheme(c), c.Request.Host, code),
	})
}

func getScheme(c *gin.Context) string {
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		return "https"
	}
	return "http"
}

func uploadChunkHandler(c *gin.Context) {
	identifier := c.PostForm("identifier")
	index := c.PostForm("index")
	if identifier == "" || index == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "获取分片失败"})
		return
	}

	tempDir := filepath.Join("uploads", "chunks", identifier)
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建临时目录失败"})
		return
	}

	chunkPath := filepath.Join(tempDir, index)
	if err := c.SaveUploadedFile(file, chunkPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存分片失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func uploadCompleteHandler(c *gin.Context) {
	var req struct {
		Identifier  string `json:"identifier"`
		Filename    string `json:"filename"`
		TotalChunks int    `json:"totalChunks"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求"})
		return
	}

	absPath, _ := filepath.Abs("uploads")
	dst := filepath.Join(absPath, req.Filename)

	if _, err := os.Stat(dst); err == nil {
		ext := filepath.Ext(req.Filename)
		nameOnly := strings.TrimSuffix(req.Filename, ext)
		dst = filepath.Join(absPath, fmt.Sprintf("%s_%d%s", nameOnly, time.Now().Unix(), ext))
	}

	finalFile, err := os.Create(dst)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建目标文件失败"})
		return
	}
	defer finalFile.Close()

	tempDir := filepath.Join("uploads", "chunks", req.Identifier)
	var totalSize int64

	for i := 0; i < req.TotalChunks; i++ {
		chunkPath := filepath.Join(tempDir, strconv.Itoa(i))
		chunkData, err := os.ReadFile(chunkPath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("读取分片 %d 失败", i)})
			return
		}
		n, err := finalFile.Write(chunkData)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "合并文件失败"})
			return
		}
		totalSize += int64(n)
	}

	code := generateCode()
	for {
		mu.RLock()
		_, exists := fileRecords[code]
		mu.RUnlock()
		if !exists {
			break
		}
		code = generateCode()
	}

	now := time.Now()
	mu.Lock()
	fileRecords[code] = FileRecord{
		Filename:   filepath.Base(dst),
		FilePath:   dst,
		Size:       totalSize,
		Code:       code,
		ExpireAt:   now.Add(time.Duration(config.Retention.InitialHours) * time.Hour),
		CreatedAt:  now,
		UploadedAt: now,
	}
	mu.Unlock()

	incrementIPUploadCount(getClientIP(c))

	os.RemoveAll(tempDir)

	c.JSON(http.StatusOK, gin.H{
		"code":         code,
		"filename":     filepath.Base(dst),
		"size":         totalSize,
		"expire_at":    time.Now().Add(time.Duration(config.Retention.InitialHours) * time.Hour).Format("2006-01-02 15:04:05"),
		"download_url": fmt.Sprintf("%s://%s/?code=%s", getScheme(c), c.Request.Host, code),
	})
}

func getFileInfoHandler(c *gin.Context) {
	code := strings.ToUpper(c.Param("code"))
	mu.RLock()
	record, exists := fileRecords[code]
	mu.RUnlock()

	if !exists || time.Now().After(record.ExpireAt) {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在或已过期"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"code":      record.Code,
		"filename":  record.Filename,
		"size":      record.Size,
		"expire_at": record.ExpireAt.Format("2006-01-02 15:04:05"),
	})
}

func downloadByCodeHandler(c *gin.Context) {
	code := strings.ToUpper(c.Param("code"))
	mu.Lock()
	record, exists := fileRecords[code]

	if !exists || time.Now().After(record.ExpireAt) {
		mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在或已过期"})
		return
	}

	if record.FirstDownloadAt == nil {
		now := time.Now()
		record.FirstDownloadAt = &now
		record.ExpireAt = now.Add(time.Duration(config.Retention.AfterDownloadHours) * time.Hour)
		fileRecords[code] = record
		log.Printf("文件 %s 首次被访问，将于 %d 小时后销毁", code, config.Retention.AfterDownloadHours)
	}
	mu.Unlock()

	f, err := os.Open(record.FilePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "文件打开失败"})
		return
	}
	defer f.Close()

	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", strconv.FormatInt(record.Size, 10))
	escaped := url.QueryEscape(record.Filename)
	c.Header("Content-Disposition", "attachment; filename=\""+record.Filename+"\"; filename*=UTF-8''"+escaped)

	n, err := io.Copy(c.Writer, f)
	if err != nil {
		log.Printf("Download aborted or failed for code %s: %v", code, err)
		return
	}
	if n != record.Size {
		log.Printf("Download size mismatch for code %s: wrote %d expected %d", code, n, record.Size)
		return
	}
}

func init() {
	fmt.Println("FilesGo - Dual Mode File Transfer System")
}
