//go:build prod

package main

import (
	"embed"
	"io/fs"
)

//go:embed dist/*
var frontendAssets embed.FS

func getFrontendFS() (fs.FS, error) {
	return fs.Sub(frontendAssets, "dist")
}

