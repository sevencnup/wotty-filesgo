package crypto

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

func GenerateDeviceID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func GeneratePairingKey(deviceID string) string {
	b := make([]byte, 8)
	rand.Read(b)
	hash := sha256.Sum256([]byte(deviceID + hex.EncodeToString(b)))
	return hex.EncodeToString(hash[:8])
}

func GenerateMessageID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func GenerateFileCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	rand.Read(b)
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b)
}

func HashPassword(password string) string {
	hash := sha256.Sum256([]byte(password))
	return hex.EncodeToString(hash[:])
}

func VerifyPasswordHash(password, hash string) bool {
	return HashPassword(password) == hash
}

func GenerateToken(deviceID string) string {
	b := make([]byte, 32)
	rand.Read(b)
	return fmt.Sprintf("%s:%x", deviceID, b)
}
