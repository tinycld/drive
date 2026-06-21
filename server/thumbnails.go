package drive

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"tinycld.org/core/previewqueue"
	"tinycld.org/core/thumbnails"
	"tinycld.org/core/thumbnails/textpreview"
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
//
// Editor docs (text/calc) flush with thumb_region_hash set and stash a
// PageModel payload; we render a lightweight pure-Go text preview (no mupdf)
// and skip entirely when the region is unchanged. Regular uploads leave
// thumb_region_hash empty and take the existing mupdf/HEIC path.
func generateThumbnail(app *pocketbase.PocketBase, record *core.Record, payload previewqueue.Payload, hasPayload bool) {
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

	if record.GetString("thumb_region_hash") != "" {
		generateEditorThumbnail(app, record, filename, payload, hasPayload)
		return
	}

	generateUploadThumbnail(app, record, filename)
}

// generateEditorThumbnail renders the lightweight pure-Go text preview for an
// editor doc and saves it to the thumbnail field.
func generateEditorThumbnail(
	app *pocketbase.PocketBase,
	record *core.Record,
	filename string,
	payload previewqueue.Payload,
	hasPayload bool,
) {
	// Region unchanged since the last preview — nothing visible would change.
	if record.GetString("thumbnail") != "" &&
		record.Original().GetString("thumb_region_hash") == record.GetString("thumb_region_hash") {
		return
	}

	var model textpreview.PageModel
	if hasPayload {
		model = payload.Page
	} else {
		// Fallback (no stashed payload): read + extract the file bytes and
		// build a minimal text-only page model from the first region.
		mimeType := record.GetString("mime_type")
		text, ok := extractFileText(app, record, filename, mimeType)
		if !ok {
			return
		}
		region, _ := textpreview.FirstRegionText(text)
		model = textpreview.PageModel{Lines: splitPreviewLines(region)}
	}

	outputPath, err := renderTextPreview(app, record, model)
	if err != nil {
		return
	}
	defer os.Remove(outputPath)

	saveThumbnail(app, record, filename, outputPath)
}

// generateUploadThumbnail is the existing mupdf/HEIC path for regular uploads,
// unchanged in behavior.
func generateUploadThumbnail(app *pocketbase.PocketBase, record *core.Record, filename string) {
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

	saveThumbnail(app, record, filename, outputPath)
}

// renderTextPreview renders model to a temp .jpg file and returns its path. The
// caller owns removing the file.
func renderTextPreview(app *pocketbase.PocketBase, record *core.Record, model textpreview.PageModel) (string, error) {
	outputFile, err := os.CreateTemp(os.TempDir(), "thumb-out-*.jpg")
	if err != nil {
		app.Logger().Warn("Thumbnail: failed to create temp output",
			"id", record.Id, "error", err)
		return "", err
	}
	outputPath := outputFile.Name()
	outputFile.Close()

	if err := textpreview.RenderJPEG(model, outputPath, thumbnails.DefaultWidth, thumbnails.DefaultHeight); err != nil {
		app.Logger().Warn("Thumbnail: text preview render failed",
			"id", record.Id, "error", err)
		os.Remove(outputPath)
		return "", err
	}

	return outputPath, nil
}

// saveThumbnail reads the generated jpg at outputPath and persists it to the
// record's thumbnail field, re-fetching the record and re-checking liveness
// (the generation above is slow and the app/DB can be reset out from under this
// goroutine in that window).
func saveThumbnail(app *pocketbase.PocketBase, record *core.Record, filename, outputPath string) {
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

// splitPreviewLines breaks a text region into preview lines, splitting on
// newlines and wrapping any long line to ~90 characters.
func splitPreviewLines(region string) []string {
	const maxLineChars = 90
	var lines []string
	for _, raw := range strings.Split(region, "\n") {
		if len(raw) <= maxLineChars {
			lines = append(lines, raw)
			continue
		}
		runes := []rune(raw)
		for len(runes) > maxLineChars {
			lines = append(lines, string(runes[:maxLineChars]))
			runes = runes[maxLineChars:]
		}
		if len(runes) > 0 {
			lines = append(lines, string(runes))
		}
	}
	return lines
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
