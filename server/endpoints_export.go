package drive

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"github.com/nathanstitt/doctaculous/pkg/doctaculous"
)

// Export converts a drive item to another document format on the server
// (doctaculous) and streams the result back as a download. The target format is
// the `to` param (PDF, DOCX, XLSX, HTML, Markdown, Text, CSV, RTF, EPUB);
// omitting it defaults to PDF.
//
// Auth mirrors the folder-download flow (endpoints_download.go): an authed POST
// mints a single-use, short-lived token after the read-access check, and an
// unauthed GET consumes it. A browser anchor-download can't send the bearer
// header, so the token in the URL is the credential — never a raw item id.

const (
	exportTokenTTL   = 60 * time.Second
	maxExportBytes   = 50 << 20 // 50 MB, matching core thumbnails' input cap
	exportRenderWait = 60 * time.Second
)

type exportToken struct {
	itemID    string
	orgID     string
	to        doctaculous.Format
	expiresAt time.Time
}

var (
	exportTokens   = map[string]exportToken{}
	exportTokensMu sync.Mutex
)

func init() {
	go func() {
		for {
			time.Sleep(tokenCleanupPeriod)
			exportTokensMu.Lock()
			now := time.Now()
			for k, v := range exportTokens {
				if now.After(v.expiresAt) {
					delete(exportTokens, k)
				}
			}
			exportTokensMu.Unlock()
		}
	}()
}

// allowedTargets is the set of output formats "Download as" exposes. It's a
// deliberate subset of doctaculous's writers: image outputs (png/jpeg) and the
// same-format cases are excluded, leaving the document conversions users
// actually ask for. The client curates which of these it offers per source
// type; the server enforces the whole set plus per-pair convertibility.
var allowedTargets = map[doctaculous.Format]bool{
	doctaculous.FormatPDF:      true,
	doctaculous.FormatDOCX:     true,
	doctaculous.FormatXLSX:     true,
	doctaculous.FormatHTML:     true,
	doctaculous.FormatMarkdown: true,
	doctaculous.FormatText:     true,
	doctaculous.FormatCSV:      true,
	doctaculous.FormatRTF:      true,
	doctaculous.FormatEPUB:     true,
}

// parseTarget resolves the requested `to` value to an allowed output format,
// defaulting to PDF when empty (so existing PDF callers can omit it).
func parseTarget(to string) (doctaculous.Format, error) {
	if to == "" {
		return doctaculous.FormatPDF, nil
	}
	f := doctaculous.Format(to)
	if !allowedTargets[f] {
		return doctaculous.FormatUnknown, doctaculous.ErrUnsupportedFormat
	}
	return f, nil
}

// exportInputFormat resolves a drive item's MIME type to a doctaculous input
// format, or reports why the item can't be converted to `to`. Same-format
// conversion is a no-op (ErrSameFormat). Images are refused: doctaculous can
// wrap a PNG/JPEG in a PDF page, but "export image" is not a document workflow
// — drive already previews and downloads images directly, and the client hides
// the action for them, so we keep the server contract aligned (documents only).
func exportInputFormat(mimeType string, to doctaculous.Format) (doctaculous.Format, error) {
	from := doctaculous.FormatFromMIME(mimeType)
	if from == doctaculous.FormatPNG || from == doctaculous.FormatJPEG {
		return doctaculous.FormatUnknown, doctaculous.ErrUnsupportedFormat
	}
	if err := doctaculous.CanConvert(from, to); err != nil {
		return doctaculous.FormatUnknown, err
	}
	return from, nil
}

// handleCreateExportToken validates read access + convertibility and returns a
// single-use token URL the client hands to downloadFromUrl.
func handleCreateExportToken(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	var body struct {
		Item string `json:"item"`
		To   string `json:"to"`
	}
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.BadRequestError("invalid request body", nil)
	}
	if body.Item == "" {
		return re.BadRequestError("missing item", nil)
	}

	to, err := parseTarget(body.To)
	if err != nil {
		return re.BadRequestError("unsupported export target", nil)
	}

	item, _, err := resolveItemAndUserOrg(app, re, body.Item, false)
	if err != nil {
		return err
	}
	if item.GetBool("is_folder") {
		return re.BadRequestError("item is a folder", nil)
	}
	if item.GetString("file") == "" {
		return re.BadRequestError("item has no file", nil)
	}

	if _, err := exportInputFormat(item.GetString("mime_type"), to); err != nil {
		if errors.Is(err, doctaculous.ErrSameFormat) {
			return re.BadRequestError("item is already in that format", nil)
		}
		return re.BadRequestError("this file type can't be converted to the requested format", nil)
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return re.InternalServerError("failed to generate token", nil)
	}
	token := hex.EncodeToString(tokenBytes)

	exportTokensMu.Lock()
	exportTokens[token] = exportToken{
		itemID:    item.Id,
		orgID:     item.GetString("org"),
		to:        to,
		expiresAt: time.Now().Add(exportTokenTTL),
	}
	exportTokensMu.Unlock()

	return re.JSON(http.StatusOK, map[string]any{
		"token": token,
		"url":   "/api/drive/export?token=" + token,
	})
}

// handleExport consumes an export token, converts the item to the requested
// format, and streams the result.
func handleExport(app *pocketbase.PocketBase, re *core.RequestEvent) error {
	token := re.Request.URL.Query().Get("token")
	if token == "" {
		return re.UnauthorizedError("missing token", nil)
	}

	exportTokensMu.Lock()
	et, ok := exportTokens[token]
	if ok {
		delete(exportTokens, token) // single-use
	}
	exportTokensMu.Unlock()

	if !ok || time.Now().After(et.expiresAt) {
		return re.UnauthorizedError("invalid or expired token", nil)
	}

	// Re-fetch the record and re-check the org so a token can't outlive a move
	// between orgs (the access check already ran at mint time).
	item, err := app.FindRecordById("drive_items", et.itemID)
	if err != nil || item.GetString("org") != et.orgID {
		return re.NotFoundError("item not found", nil)
	}

	from, err := exportInputFormat(item.GetString("mime_type"), et.to)
	if err != nil {
		return re.BadRequestError("this file type can't be exported", nil)
	}

	data, err := readItemBytesCapped(app, item, maxExportBytes)
	if err != nil {
		return re.InternalServerError("failed to read file", nil)
	}

	doc, err := doctaculous.OpenBytesAs(from, data)
	if err != nil {
		return re.InternalServerError("failed to open document", nil)
	}

	ctx, cancel := context.WithTimeout(re.Request.Context(), exportRenderWait)
	defer cancel()

	logf := func(format string, args ...any) {
		app.Logger().Debug("drive.export: " + fmt.Sprintf(format, args...))
	}
	var buf bytes.Buffer
	if err := doc.Write(ctx, &buf, et.to, doctaculous.ConvertOptions{
		PDF:  doctaculous.PDFOptions{Title: item.GetString("name")},
		Logf: logf,
	}); err != nil {
		return re.InternalServerError("failed to convert document", nil)
	}

	re.Response.Header().Set("Content-Type", et.to.MIME())
	re.Response.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="%s.%s"`, sanitizeFilename(baseName(item.GetString("name"))), targetExt(et.to)))
	_, err = io.Copy(re.Response, &buf)
	return err
}

// targetExt is the download file extension for an output format. Mostly the
// format string itself, with the two aliases users expect (.txt, .md).
func targetExt(f doctaculous.Format) string {
	switch f {
	case doctaculous.FormatText:
		return "txt"
	case doctaculous.FormatMarkdown:
		return "md"
	default:
		return string(f)
	}
}

// readItemBytesCapped reads a drive item's file into memory, erroring if it
// exceeds max. doctaculous parses the whole input in memory, so this bounds
// worst-case allocation per export.
func readItemBytesCapped(app *pocketbase.PocketBase, item *core.Record, max int64) ([]byte, error) {
	reader, err := readFileContent(app, item)
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	data, err := io.ReadAll(io.LimitReader(reader, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > max {
		return nil, fmt.Errorf("drive.export: file exceeds %d bytes", max)
	}
	return data, nil
}

// baseName strips a trailing extension from name so the converted download is
// "report.pdf", not "report.docx.pdf".
func baseName(name string) string {
	if i := strings.LastIndexByte(name, '.'); i > 0 {
		return name[:i]
	}
	return name
}
