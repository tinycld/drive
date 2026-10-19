package drive

import (
	"context"

	"github.com/pocketbase/pocketbase/core"

	"tinycld.org/core/previewqueue"
	"tinycld.org/core/textextract"
)

// extractAndIndexDriveItem extracts text from the file attached to a drive item
// and updates its FTS content. It runs as a background job; ctx ends when the
// app terminates.
//
// Editor docs (text/calc) flush with an index_hash set and stash a payload
// carrying the already-extracted plaintext, letting us skip the slow re-extract
// — and skip entirely when the hash is unchanged. Regular uploads leave
// index_hash empty and take the full read-bytes + extract path.
func extractAndIndexDriveItem(ctx context.Context, app core.App, record *core.Record, payload previewqueue.Payload, hasPayload bool) {
	if ctx.Err() != nil {
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
	if mimeType == "" {
		return
	}

	indexHash := record.GetString("index_hash")

	// Editor doc whose text is unchanged since the last index — nothing to do.
	if indexHash != "" && record.Original().GetString("index_hash") == indexHash {
		return
	}

	var text string

	if indexHash != "" {
		// Editor doc with changed text: prefer the stashed plaintext to avoid
		// re-extracting; fall back to reading + extracting the file bytes.
		if hasPayload {
			text = payload.Plaintext
		} else {
			extracted, ok := extractFileText(app, record, filename, mimeType)
			if !ok {
				return
			}
			text = extracted
		}
	} else {
		// Upload path: full read-bytes + extract.
		extracted, ok := extractFileText(app, record, filename, mimeType)
		if !ok {
			return
		}
		text = extracted
	}

	if text == "" {
		return
	}

	// Extraction above is slow; a terminating app should not start a new write.
	if ctx.Err() != nil {
		return
	}

	whenWritable(ctx, ftsIndexDroppedMsg, func() {
		updateFTSContent(app, record.Id, text)
	}, "itemID", record.Id)
}

const ftsIndexDroppedMsg = "drive item text index dropped: the server stayed read-only past the wait"

// extractFileText reads the record's file from storage and runs text
// extraction. It reports false (with a logged warning) on any read/extract
// failure so callers can bail without writing FTS content.
func extractFileText(app core.App, record *core.Record, filename, mimeType string) (string, bool) {
	fsys, err := app.NewFilesystem()
	if err != nil {
		app.Logger().Warn("Drive FTS: failed to open filesystem",
			"id", record.Id, "error", err)
		return "", false
	}
	defer fsys.Close()

	key := record.BaseFilesPath() + "/" + filename
	blob, err := fsys.GetReader(key)
	if err != nil {
		app.Logger().Warn("Drive FTS: failed to read file",
			"id", record.Id, "key", key, "error", err)
		return "", false
	}
	defer blob.Close()

	text, err := textextract.Extract(blob, mimeType, textextract.MaxOutputBytes)
	if err != nil {
		app.Logger().Warn("Drive FTS: text extraction failed",
			"id", record.Id, "mime", mimeType, "error", err)
		return "", false
	}

	return text, true
}
