package drive

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"tinycld.org/core/previewqueue"
	"tinycld.org/core/thumbnails"
	"tinycld.org/core/thumbnails/textpreview"
)

// thumbnailTimeout bounds the omnidoc document render, which checks the
// context between rasterization steps. The storage-blob read and core's HEIF
// decode are not context-aware, so those steps aren't cancelled by it.
const thumbnailTimeout = 60 * time.Second

// appIsLive reports whether the app still has an open database connection.
// generateThumbnail runs in a FireAndForget goroutine that can outlive the app
// instance — e.g. the test harness resets the dev DB while a thumbnail job is
// in flight. Once the app is torn down, ConcurrentDB() is nil and any record
// query (PocketBase v0.38 RecordQuery) panics on the nil DB instead of
// returning an error. Bail out instead of touching the DB in that window.
func appIsLive(app core.App) bool {
	return app != nil && app.ConcurrentDB() != nil
}

// generateThumbnail generates a thumbnail for a drive item's file and stores it
// on the record's thumbnail field. Designed to run in a goroutine.
//
// Editor docs (text/calc) flush with thumb_region_hash set and stash a
// PageModel payload; we render a lightweight text preview and skip entirely
// when the region is unchanged. Regular uploads leave thumb_region_hash empty
// and take the omnidoc/HEIC document-render path.
func generateThumbnail(app core.App, record *core.Record, payload previewqueue.Payload, hasPayload bool) {
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
	app core.App,
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

	thumbData, err := renderTextPreview(app, record, model)
	if err != nil {
		return
	}

	saveThumbnail(app, record, filename, thumbData)
}

// generateUploadThumbnail renders the first page of a regular upload via
// omnidoc (HEIC decoded in-library, pure Go), streaming straight from storage — no temp
// files.
func generateUploadThumbnail(app core.App, record *core.Record, filename string) {
	mimeType := record.GetString("mime_type")
	if !thumbnails.CanGenerate(mimeType) {
		app.Logger().Debug("Thumbnail: skipping unsupported mime type",
			"id", record.Id, "mime", mimeType)
		return
	}
	app.Logger().Debug("Thumbnail: starting generation",
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

	ctx, cancel := context.WithTimeout(context.Background(), thumbnailTimeout)
	defer cancel()

	var thumb bytes.Buffer
	if err := thumbnails.Generate(ctx, &thumb, blob, mimeType, thumbnails.DefaultWidth, thumbnails.DefaultHeight); err != nil {
		app.Logger().Warn("Thumbnail: generation failed",
			"id", record.Id, "mime", mimeType, "error", err)
		return
	}

	saveThumbnail(app, record, filename, thumb.Bytes())
}

// renderTextPreview renders model to a JPEG and returns its bytes.
func renderTextPreview(app core.App, record *core.Record, model textpreview.PageModel) ([]byte, error) {
	outputFile, err := os.CreateTemp(os.TempDir(), "thumb-out-*.jpg")
	if err != nil {
		app.Logger().Warn("Thumbnail: failed to create temp output",
			"id", record.Id, "error", err)
		return nil, err
	}
	outputPath := outputFile.Name()
	outputFile.Close()
	defer os.Remove(outputPath)

	if err := textpreview.RenderJPEG(model, outputPath, thumbnails.DefaultWidth, thumbnails.DefaultHeight); err != nil {
		app.Logger().Warn("Thumbnail: text preview render failed",
			"id", record.Id, "error", err)
		return nil, err
	}

	thumbData, err := os.ReadFile(outputPath)
	if err != nil {
		app.Logger().Warn("Thumbnail: failed to read generated thumbnail",
			"id", record.Id, "error", err)
		return nil, err
	}
	return thumbData, nil
}

// saveThumbnail persists the generated jpg bytes to the record's thumbnail
// field, re-fetching the record and re-checking liveness (the generation above
// is slow and the app/DB can be reset out from under this goroutine in that
// window).
func saveThumbnail(app core.App, record *core.Record, filename string, thumbData []byte) {
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
	app.Logger().Debug("Thumbnail: saved", "id", record.Id, "thumbnail", thumbFilename)
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
