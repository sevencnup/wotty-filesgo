package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"filesgo/internal/crypto"
	"filesgo/internal/database"
	"filesgo/internal/models"
	"filesgo/internal/websocket"

	"github.com/gin-gonic/gin"
)

type Handlers struct {
	DB  *sql.DB
	Hub *websocket.Hub
}

func NewHandlers(db *sql.DB, hub *websocket.Hub) *Handlers {
	return &Handlers{DB: db, Hub: hub}
}

type RegisterDeviceRequest struct {
	DeviceID   string `json:"device_id"`
	DeviceName string `json:"device_name"`
	PublicKey  string `json:"public_key"`
}

type RegisterDeviceResponse struct {
	DeviceID string `json:"device_id"`
	Token    string `json:"token"`
}

func (h *Handlers) RegisterDevice(c *gin.Context) {
	var req RegisterDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if req.DeviceID == "" {
		req.DeviceID = crypto.GenerateDeviceID()
	}

	if req.DeviceName == "" {
		req.DeviceName = "Device-" + req.DeviceID[:8]
	}

	token := crypto.GenerateToken(req.DeviceID)

	if err := database.RegisterDevice(req.DeviceID, req.DeviceName, req.PublicKey); err != nil {
		log.Printf("Failed to register device: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register device"})
		return
	}

	c.JSON(http.StatusOK, RegisterDeviceResponse{
		DeviceID: req.DeviceID,
		Token:    token,
	})
}

func (h *Handlers) GetDeviceInfo(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		deviceID = c.Query("device_id")
	}

	device, err := database.GetDevice(deviceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}

	c.JSON(http.StatusOK, device)
}

type UpdateDeviceNameRequest struct {
	Name string `json:"name"`
}

func (h *Handlers) UpdateDeviceName(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		deviceID = c.Param("device_id")
	}

	var req UpdateDeviceNameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := database.UpdateDeviceName(deviceID, req.Name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update device name"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device name updated"})
}

type GeneratePairingKeyResponse struct {
	PairingKey string `json:"pairing_key"`
}

func (h *Handlers) GeneratePairingKey(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		deviceID = c.Query("device_id")
	}

	pairingKey := crypto.GeneratePairingKey(deviceID)

	c.JSON(http.StatusOK, GeneratePairingKeyResponse{
		PairingKey: pairingKey,
	})
}

type PairingRequest struct {
	TargetKey string `json:"target_key"`
}

func (h *Handlers) RequestPairing(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req PairingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	var targetDeviceID string
	err := h.DB.QueryRow(`SELECT id FROM devices WHERE id = ? OR public_key = ?`, 
		req.TargetKey, req.TargetKey).Scan(&targetDeviceID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Target device not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if targetDeviceID == deviceID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot pair with yourself"})
		return
	}

	if err := database.CreatePairingRequest(deviceID, targetDeviceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create pairing request"})
		return
	}

	requester, _ := database.GetDevice(deviceID)

	h.Hub.SendToDevice(targetDeviceID, mustMarshal(websocket.WSMessage{
		Type:       websocket.MessageTypePairingRequest,
		FromDevice: deviceID,
		Content:    requester.Name,
		Timestamp:  time.Now().Unix(),
	}))

	c.JSON(http.StatusOK, gin.H{"message": "Pairing request sent"})
}

func (h *Handlers) AcceptPairing(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req struct {
		PairingID int64 `json:"pairing_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := database.AcceptPairing(req.PairingID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to accept pairing"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Pairing accepted"})
}

func (h *Handlers) RejectPairing(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req struct {
		PairingID int64 `json:"pairing_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := database.RejectPairing(req.PairingID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reject pairing"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Pairing rejected"})
}

func (h *Handlers) GetPairedDevices(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		deviceID = c.Query("device_id")
	}

	devices, err := database.GetPairedDevices(deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get paired devices"})
		return
	}

	for i, device := range devices {
		deviceID := device["device_id"].(string)
		devices[i]["is_online"] = h.Hub.IsOnline(deviceID)
	}

	c.JSON(http.StatusOK, devices)
}

func (h *Handlers) DeletePairing(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	targetDeviceID := c.Param("device_id")

	if err := database.DeletePairing(deviceID, targetDeviceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete pairing"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Pairing deleted"})
}

func (h *Handlers) GetPendingPairingRequests(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	requests, err := database.GetPendingPairingRequests(deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get pending requests"})
		return
	}

	c.JSON(http.StatusOK, requests)
}

func (h *Handlers) GetMessages(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		deviceID = c.Query("device_id")
	}

	targetDeviceID := c.Query("target_device_id")

	limit := 50
	offset := 0

	var messages []models.Message
	var err error

	if targetDeviceID != "" {
		messages, err = database.GetConversationMessages(deviceID, targetDeviceID, limit, offset)
	} else {
		messages, err = database.GetMessages(deviceID, limit, offset)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get messages"})
		return
	}

	c.JSON(http.StatusOK, messages)
}

type SendMessageRequest struct {
	ToDevice     string `json:"to_device"`
	MessageType  string `json:"message_type"`
	Content      string `json:"content"`
	FileName     string `json:"file_name,omitempty"`
	FileSize     int64  `json:"file_size,omitempty"`
	FileCode     string `json:"file_code,omitempty"`
}

func (h *Handlers) SendMessage(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if req.ToDevice == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Target device required"})
		return
	}

	msg := &models.Message{
		MessageID:   crypto.GenerateMessageID(),
		FromDevice:  deviceID,
		ToDevice:    req.ToDevice,
		MessageType: req.MessageType,
		Content:     req.Content,
		FileName:    req.FileName,
		FileSize:    req.FileSize,
		FileCode:    req.FileCode,
		Status:      "sent",
	}

	if err := database.SaveMessage(msg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save message"})
		return
	}

	wsMsg := websocket.WSMessage{
		Type:        websocket.MessageTypeText,
		FromDevice:  deviceID,
		ToDevice:    req.ToDevice,
		MessageID:   msg.MessageID,
		MessageType: websocket.MessageType(req.MessageType),
		Content:     req.Content,
		Timestamp:   msg.CreatedAt,
	}

	if req.MessageType == "file" || req.MessageType == "image" {
		wsMsg.FileName = req.FileName
		wsMsg.FileSize = req.FileSize
		wsMsg.FileCode = req.FileCode
	}

	if h.Hub.SendToDevice(req.ToDevice, mustMarshal(wsMsg)) {
		database.UpdateMessageStatus(msg.MessageID, "delivered")
		msg.Status = "delivered"
	}

	c.JSON(http.StatusOK, msg)
}

func (h *Handlers) UpdateMessageStatus(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	messageID := c.Param("message_id")

	var req struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := database.UpdateMessageStatus(messageID, req.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update message status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Status updated"})
}

func (h *Handlers) GetUnreadCount(c *gin.Context) {
	deviceID := c.GetString("device_id")
	if deviceID == "" {
		deviceID = c.Query("device_id")
	}

	count, err := database.GetUnreadMessageCount(deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get unread count"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"unread_count": count})
}

func mustMarshal(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}
