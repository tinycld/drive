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

	"github.com/pocketbase/pocketbase/core"

	"github.com/nathanstitt/doctaculous/pkg/doctaculous"
	"tinycld.org/packages/drive/api"
)

// Export converts a drive item to another format on the server and streams the
// result back as a download. v1 targets PDF only; the token/route shape is
// generic so other output formats can slot in behind the same `to` param.
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

// exportInputFormat resolves a drive item's MIME type to a doctaculous input
// format, or reports why the item can't be exported. Already-PDF items are
// refused because a PDF->PDF conversion is a no-op (ErrSameFormat). Images are
// refused too: doctaculous can wrap a PNG/JPEG in a PDF page, but "export image
// to PDF" is not a document workflow — drive already previews and downloads
// images directly, and the client hides the action for them, so we keep the
// server contract aligned (documents only).
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
func handleCreateExportToken(app core.App, re *core.RequestEvent) error {
	var body api.ExportTokenRequest
	if err := json.NewDecoder(re.Request.Body).Decode(&body); err != nil {
		return re.BadRequestError("invalid request body", nil)
	}
	if body.Item == "" {
		return re.BadRequestError("missing item", nil)
	}

	// v1 only exports to PDF. Default an empty `to` to PDF so callers can omit it.
	to := doctaculous.FormatPDF
	if body.To != "" && body.To != string(doctaculous.FormatPDF) {
		return re.BadRequestError("unsupported export target", nil)
	}

	item, _, err := resolveItemAndUser(app, re, body.Item, false)
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
			return re.BadRequestError("item is already a PDF", nil)
		}
		return re.BadRequestError("this file type can't be exported to PDF", nil)
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return re.InternalServerError("failed to generate token", nil)
	}
	token := hex.EncodeToString(tokenBytes)

	exportTokensMu.Lock()
	exportTokens[token] = exportToken{
		itemID:    item.Id,
		to:        to,
		expiresAt: time.Now().Add(exportTokenTTL),
	}
	exportTokensMu.Unlock()

	return re.JSON(http.StatusOK, api.TokenResponse{
		Token: token,
		URL:   "/api/drive/export?token=" + token,
	})
}

// handleExport consumes an export token, converts the item, and streams the PDF.
func handleExport(app core.App, re *core.RequestEvent) error {
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
	if err != nil {
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

	var buf bytes.Buffer
	if err := doc.WritePDF(ctx, &buf, doctaculous.PDFOptions{
		Title: item.GetString("name"),
		Logf:  func(format string, args ...any) { app.Logger().Debug("drive.export: " + fmt.Sprintf(format, args...)) },
	}); err != nil {
		return re.InternalServerError("failed to render PDF", nil)
	}

	re.Response.Header().Set("Content-Type", "application/pdf")
	re.Response.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="%s.pdf"`, sanitizeFilename(pdfBaseName(item.GetString("name")))))
	_, err = io.Copy(re.Response, &buf)
	return err
}

// readItemBytesCapped reads a drive item's file into memory, erroring if it
// exceeds max. doctaculous parses the whole input in memory, so this bounds
// worst-case allocation per export.
func readItemBytesCapped(app core.App, item *core.Record, max int64) ([]byte, error) {
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

// pdfBaseName strips a known document extension from name so the download is
// "report.pdf", not "report.docx.pdf".
func pdfBaseName(name string) string {
	if i := strings.LastIndexByte(name, '.'); i > 0 {
		return name[:i]
	}
	return name
}
