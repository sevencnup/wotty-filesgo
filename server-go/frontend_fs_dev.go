//go:build !prod

package main

import (
	"io/fs"
	"os"
)

func getFrontendFS() (fs.FS, error) {
	if _, err := os.Stat("dist"); err != nil {
		return nil, nil
	}
	return os.DirFS("dist"), nil
}
