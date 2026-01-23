package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

//go:embed dist/*
var frontendAssets embed.FS

// Database Model
type FileRecord struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Filename  string    `json:"filename"`
	FilePath  string    `json:"-"`
	Size      int64     `json:"size"`
	Hash      string    `json:"hash"`
	Code      string    `gorm:"uniqueIndex;not null" json:"code"` // 提取码
	ExpireAt  time.Time `json:"expire_at"`                        // 过期时间
	CreatedAt time.Time `json:"created_at"`
}

var db *gorm.DB

func initDB() {
	var err error
	db, err = gorm.Open(sqlite.Open("cloud.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("failed to connect database")
	}
	db.AutoMigrate(&FileRecord{})
}

// Rust Worker Response Structure
type RustResponse struct {
	Hash   string `json:"hash"`
	Size   int64  `json:"size"`
	Status string `json:"status"`
}

func main() {
	log.Println("=== Go Server Started (Updated Version) ===")
	initDB()

	// 获取端口配置，默认为 8080
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Start Cleanup Task (Runs every minute)
	go startCleanupTask()

	// Create uploads directory
	if _, err := os.Stat("uploads"); os.IsNotExist(err) {
		os.Mkdir("uploads", 0755)
	}

	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Serve Static Files (Embedded Frontend)
	distFS, err := fs.Sub(frontendAssets, "dist")
	if err != nil {
		log.Fatal("Failed to load embedded assets:", err)
	}

	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// 如果是 API 请求，返回 404
		if strings.HasPrefix(path, "/api") {
			c.JSON(http.StatusNotFound, gin.H{"error": "API route not found"})
			return
		}

		// 去掉开头的斜杠
		filePath := strings.TrimPrefix(path, "/")
		if filePath == "" {
			filePath = "index.html"
		}

		// 尝试从嵌入的 dist 目录读取文件
		_, err := fs.Stat(distFS, filePath)
		if err == nil {
			c.FileFromFS(filePath, http.FS(distFS))
			return
		}

		// 如果文件不存在，返回 index.html (支持 SPA 路由)
		c.FileFromFS("index.html", http.FS(distFS))
	})

	// API Routes
	api := r.Group("/api")
	{
		api.POST("/upload", uploadHandler)
		// api.GET("/files", listFilesHandler) // Disable file list for privacy
		api.GET("/file/:code", getFileInfoHandler)
		api.GET("/download/:code", downloadByCodeHandler)
	}

	log.Println("Go Server running on http://localhost:8080")
	r.Run(":8080")
}

// Generate a 6-character random code (uppercase letters + numbers, excluding confusing ones)
func generateCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	seededRand := rand.New(rand.NewSource(time.Now().UnixNano()))
	b := make([]byte, 6)
	for i := range b {
		b[i] = charset[seededRand.Intn(len(charset))]
	}
	return string(b)
}

func startCleanupTask() {
	ticker := time.NewTicker(1 * time.Minute)
	for range ticker.C {
		var expiredFiles []FileRecord
		// Find expired files
		if err := db.Where("expire_at < ?", time.Now()).Find(&expiredFiles).Error; err != nil {
			log.Println("Error querying expired files:", err)
			continue
		}

		for _, file := range expiredFiles {
			// Delete from disk
			if err := os.Remove(file.FilePath); err != nil {
				log.Printf("Failed to delete file %s: %v", file.FilePath, err)
			}
			// Delete from DB
			db.Delete(&file)
			log.Printf("Cleaned up expired file: %s (Code: %s)", file.Filename, file.Code)
		}
	}
}

func uploadHandler(c *gin.Context) {
	// 10GB Limit Check
	const MaxFileSize = 10 * 1024 * 1024 * 1024
	if c.Request.ContentLength > MaxFileSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "文件过大，限制 10GB"})
		return
	}
	// Limit body reading just in case
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxFileSize+1024) // +1KB for overhead

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Save file locally
	absPath, _ := filepath.Abs("uploads")
	dst := filepath.Join(absPath, file.Filename)
	// Handle duplicate filenames by appending timestamp if needed (simple version overwrites)
	if err := c.SaveUploadedFile(file, dst); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Call Rust Worker for processing
	hash, size, err := callRustWorker(dst)
	if err != nil {
		log.Printf("Rust worker error: %v", err)
		size = file.Size
		hash = "pending_processing"
	}

	// Generate Code and Set Expiration
	code := generateCode()
	// Ensure code uniqueness (simple retry loop)
	for {
		var count int64
		db.Model(&FileRecord{}).Where("code = ?", code).Count(&count)
		if count == 0 {
			break
		}
		code = generateCode()
	}

	record := FileRecord{
		Filename:  file.Filename,
		FilePath:  dst,
		Size:      size,
		Hash:      hash,
		Code:      code,
		ExpireAt:  time.Now().Add(12 * time.Hour),
		CreatedAt: time.Now(),
	}
	if err := db.Create(&record).Error; err != nil {
		log.Printf("db create error: %v", err)
	}
	c.JSON(http.StatusOK, gin.H{
		"code":      code,
		"filename":  record.Filename,
		"size":      record.Size,
		"hash":      record.Hash,
		"expire_at": record.ExpireAt,
	})
}

func callRustWorker(filepath string) (string, int64, error) {
	requestBody, _ := json.Marshal(map[string]string{
		"filepath": filepath,
	})

	// Set timeout for Rust worker
	client := http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Post("http://127.0.0.1:8081/process", "application/json", bytes.NewBuffer(requestBody))
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()

	var rustResp RustResponse
	if err := json.NewDecoder(resp.Body).Decode(&rustResp); err != nil {
		return "", 0, err
	}

	if rustResp.Status != "success" {
		return "", 0, fmt.Errorf("rust worker returned error")
	}

	return rustResp.Hash, rustResp.Size, nil
}

/*
func listFilesHandler(c *gin.Context) {
	var files []FileRecord
	// Only show non-expired files
	db.Where("expire_at > ?", time.Now()).Order("created_at desc").Find(&files)
	c.JSON(http.StatusOK, files)
}
*/

func getFileInfoHandler(c *gin.Context) {
	code := strings.ToUpper(c.Param("code"))
	var file FileRecord
	if err := db.Where("code = ? AND expire_at > ?", code, time.Now()).First(&file).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在或已过期"})
		return
	}
	c.JSON(http.StatusOK, file)
}

func downloadByCodeHandler(c *gin.Context) {
	code := strings.ToUpper(c.Param("code"))
	var file FileRecord
	if err := db.Where("code = ? AND expire_at > ?", code, time.Now()).First(&file).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "文件不存在或已过期"})
		return
	}
	c.Header("Content-Disposition", "attachment; filename="+file.Filename)
	c.File(file.FilePath)
}
