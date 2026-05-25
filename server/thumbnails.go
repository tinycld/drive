package drive

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"tinycld.org/core/thumbnails"
)

// appIsLive reports whether the app still has an open database connection.
// generateThumbnail runs in a FireAndForget goroutine that can outlive the app
// instance — e.g. the test harness resets the dev DB while a thumbnail job is
// in flight. Once the app is torn down, ConcurrentDB() is nil and any record
// query (PocketBase v0.38 RecordQuery) panics on the nil DB instead of
// returning an error. Bail out instead of touching the DB in that window.
func appIsLive(app *pocketbase.PocketBase) bool {
	return app != nil && app.ConcurrentDB() != nil
}

// generateThumbnail generates a thumbnail for a drive item's file and stores it
// on the record's thumbnail field. Designed to run in a goroutine.
func generateThumbnail(app *pocketbase.PocketBase, record *core.Record) {
	if !appIsLive(app) {
		return
	}

	if record.GetBool("is_folder") {
		return
	}

	filename := record.GetString("file")
	if filename == "" {
		return
	}

	mimeType := record.GetString("mime_type")
	if !thumbnails.CanGenerate(mimeType) {
		app.Logger().Debug("Thumbnail: skipping unsupported mime type",
			"id", record.Id, "mime", mimeType)
		return
	}
	app.Logger().Info("Thumbnail: starting generation",
		"id", record.Id, "mime", mimeType, "file", filename)

	// Skip if thumbnail exists and the file hasn't changed since last generation
	if record.GetString("thumbnail") != "" && record.Original().GetString("file") == filename {
		return
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		app.Logger().Warn("Thumbnail: failed to open filesystem",
			"id", record.Id, "error", err)
		return
	}
	defer fsys.Close()

	key := record.BaseFilesPath() + "/" + filename
	blob, err := fsys.GetReader(key)
	if err != nil {
		app.Logger().Warn("Thumbnail: failed to read file",
			"id", record.Id, "key", key, "error", err)
		return
	}
	defer blob.Close()

	tmpDir := os.TempDir()
	ext := filepath.Ext(filename)
	if ext == "" {
		ext = extensionForMime(mimeType)
	}

	inputFile, err := os.CreateTemp(tmpDir, "thumb-in-*"+ext)
	if err != nil {
		app.Logger().Warn("Thumbnail: failed to create temp input",
			"id", record.Id, "error", err)
		return
	}
	inputPath := inputFile.Name()
	defer os.Remove(inputPath)

	if _, err := inputFile.ReadFrom(blob); err != nil {
		inputFile.Close()
		app.Logger().Warn("Thumbnail: failed to write temp input",
			"id", record.Id, "error", err)
		return
	}
	inputFile.Close()

	outputFile, err := os.CreateTemp(tmpDir, "thumb-out-*.jpg")
	if err != nil {
		app.Logger().Warn("Thumbnail: failed to create temp output",
			"id", record.Id, "error", err)
		return
	}
	outputPath := outputFile.Name()
	outputFile.Close()
	defer os.Remove(outputPath)

	if err := thumbnails.Generate(inputPath, outputPath, mimeType, thumbnails.DefaultWidth, thumbnails.DefaultHeight); err != nil {
		app.Logger().Warn("Thumbnail: generation failed",
			"id", record.Id, "mime", mimeType, "error", err)
		return
	}

	thumbData, err := os.ReadFile(outputPath)
	if err != nil {
		app.Logger().Warn("Thumbnail: failed to read generated thumbnail",
			"id", record.Id, "error", err)
		return
	}

	thumbFilename := strings.TrimSuffix(filename, filepath.Ext(filename)) + "_thumb.jpg"
	f, err := filesystem.NewFileFromBytes(thumbData, thumbFilename)
	if err != nil {
		app.Logger().Warn("Thumbnail: failed to create file object",
			"id", record.Id, "error", err)
		return
	}

	// Re-check liveness: thumbnail generation above is slow, and the app/DB
	// can be reset out from under this goroutine in that window.
	if !appIsLive(app) {
		return
	}

	// Re-fetch the record to avoid stale data
	fresh, err := app.FindRecordById("drive_items", record.Id)
	if err != nil {
		app.Logger().Warn("Thumbnail: failed to re-fetch record",
			"id", record.Id, "error", err)
		return
	}

	fresh.Set("thumbnail", f)
	if err := app.Save(fresh); err != nil {
		app.Logger().Warn("Thumbnail: failed to save thumbnail",
			"id", record.Id, "error", err)
		return
	}
	app.Logger().Info("Thumbnail: saved", "id", record.Id, "thumbnail", thumbFilename)
}

func extensionForMime(mimeType string) string {
	switch mimeType {
	case "application/pdf":
		return ".pdf"
	case "application/epub+zip":
		return ".epub"
	case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		return ".docx"
	case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
		return ".xlsx"
	case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
		return ".pptx"
	case "image/heic", "image/heic-sequence":
		return ".heic"
	case "image/heif", "image/heif-sequence":
		return ".heif"
	default:
		return ".bin"
	}
}
