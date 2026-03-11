package websocket

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type MessageType string

const (
	MessageTypeText           MessageType = "text"
	MessageTypeFile           MessageType = "file"
	MessageTypeImage          MessageType = "image"
	MessageTypeSystem         MessageType = "system"
	MessageTypePairingRequest MessageType = "pairing_request"
	MessageTypeDeviceStatus   MessageType = "device_status"
	MessageTypeMessageStatus  MessageType = "message_status"
	MessageTypePing           MessageType = "ping"
	MessageTypePong           MessageType = "pong"
)

type WSMessage struct {
	Type        MessageType `json:"type"`
	FromDevice  string      `json:"from_device,omitempty"`
	ToDevice    string      `json:"to_device,omitempty"`
	Content     string      `json:"content,omitempty"`
	MessageID   string      `json:"message_id,omitempty"`
	MessageType MessageType `json:"message_type,omitempty"`
	Status      string      `json:"status,omitempty"`
	Timestamp   int64       `json:"timestamp,omitempty"`
	FileName    string      `json:"file_name,omitempty"`
	FileSize    int64       `json:"file_size,omitempty"`
	FileCode    string      `json:"file_code,omitempty"`
}

type Client struct {
	DeviceID   string
	DeviceName string
	Conn       *websocket.Conn
	Send       chan []byte
	Hub        *Hub
}

type Hub struct {
	Clients    map[string]*Client
	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan []byte
	mu         sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		Clients:    make(map[string]*Client),
		Register:   make(chan *Client, 256),
		Unregister: make(chan *Client, 256),
		Broadcast:  make(chan []byte, 1024),
	}
}

func (h *Hub) Run() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			if oldClient, exists := h.Clients[client.DeviceID]; exists {
				close(oldClient.Send)
				oldClient.Conn.Close()
			}
			h.Clients[client.DeviceID] = client
			h.mu.Unlock()
			log.Printf("[WS] Device connected: %s (%s)", client.DeviceID, client.DeviceName)
			h.broadcastDeviceStatus(client.DeviceID, client.DeviceName, "online")

		case client := <-h.Unregister:
			h.mu.Lock()
			if current, ok := h.Clients[client.DeviceID]; ok && current == client {
				delete(h.Clients, client.DeviceID)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("[WS] Device disconnected: %s", client.DeviceID)
			h.broadcastDeviceStatus(client.DeviceID, client.DeviceName, "offline")

		case message := <-h.Broadcast:
			var msg WSMessage
			if err := json.Unmarshal(message, &msg); err == nil {
				if msg.ToDevice != "" {
					h.SendToDevice(msg.ToDevice, message)
				} else {
					h.BroadcastAll(message)
				}
			}

		case <-ticker.C:
			h.pingAllClients()
		}
	}
}

func (h *Hub) pingAllClients() {
	h.mu.RLock()
	defer h.mu.RUnlock()

	pingMsg := WSMessage{Type: MessageTypePing, Timestamp: time.Now().Unix()}
	data, _ := json.Marshal(pingMsg)

	for _, client := range h.Clients {
		select {
		case client.Send <- data:
		default:
		}
	}
}

func (h *Hub) IsOnline(deviceID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.Clients[deviceID]
	return ok
}

func (h *Hub) GetOnlineDevices() []map[string]string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	devices := make([]map[string]string, 0, len(h.Clients))
	for deviceID, client := range h.Clients {
		devices = append(devices, map[string]string{
			"device_id":   deviceID,
			"device_name": client.DeviceName,
		})
	}
	return devices
}

func (h *Hub) SendToDevice(deviceID string, message []byte) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if client, ok := h.Clients[deviceID]; ok {
		select {
		case client.Send <- message:
			return true
		default:
			log.Printf("[WS] Device %s send buffer full", deviceID)
			return false
		}
	}
	return false
}

func (h *Hub) BroadcastAll(message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, client := range h.Clients {
		select {
		case client.Send <- message:
		default:
			log.Printf("[WS] Client buffer full, skipping")
		}
	}
}

func (h *Hub) broadcastDeviceStatus(deviceID, deviceName, status string) {
	msg := WSMessage{
		Type:        MessageTypeDeviceStatus,
		FromDevice:  deviceID,
		Content:     status,
		Timestamp:   time.Now().Unix(),
	}
	data, _ := json.Marshal(msg)
	h.BroadcastAll(data)
}

func (c *Client) ReadPump(onMessage func([]byte)) {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(512 * 1024)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS] Read error: %v", err)
			}
			break
		}
		onMessage(message)
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("[WS] Write error: %v", err)
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
