package drive

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/nathanstitt/doctaculous/pkg/doctaculous"
)

// docxMIME etc. mirror the browser-reported MIME types drive stores on
// drive_items.mime_type for these formats.
const (
	docxMIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	xlsxMIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	pptxMIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)

// TestExportInputFormat checks the convertibility gate the export token and
// handler both rely on: document formats resolve to a PDF-convertible input,
// while already-PDF and image files are refused.
func TestExportInputFormat(t *testing.T) {
	cases := []struct {
		mime    string
		wantErr bool
	}{
		{docxMIME, false},
		{xlsxMIME, false},
		{pptxMIME, false},
		{"text/csv", false},
		{"text/plain", false},
		{"application/pdf", true}, // ErrSameFormat
		{"image/png", true},       // not a document input
		{"image/jpeg", true},      // not a document input
		{"application/zip", true}, // unknown to the converter
	}
	for _, c := range cases {
		_, err := exportInputFormat(c.mime, doctaculous.FormatPDF)
		if (err != nil) != c.wantErr {
			t.Errorf("exportInputFormat(%q): err=%v, wantErr=%v", c.mime, err, c.wantErr)
		}
	}
}

// TestExportConvertsToPDF is the load-bearing check: real office fixtures run
// through the exact OpenBytesAs -> WritePDF path handleExport uses, and produce
// bytes that start with the %PDF- signature. This proves the doctaculous
// dependency is wired correctly (module + render deps resolvable) end to end.
func TestExportConvertsToPDF(t *testing.T) {
	fixtures := []struct {
		file string
		mime string
	}{
		{"sample.docx", docxMIME},
		{"sample.xlsx", xlsxMIME},
		{"sample.pptx", pptxMIME},
	}

	for _, fx := range fixtures {
		t.Run(fx.file, func(t *testing.T) {
			path := filepath.Join("..", "tests", "assets", fx.file)
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("read fixture %s: %v", path, err)
			}

			from, err := exportInputFormat(fx.mime, doctaculous.FormatPDF)
			if err != nil {
				t.Fatalf("exportInputFormat(%q): %v", fx.mime, err)
			}

			doc, err := doctaculous.OpenBytesAs(from, data)
			if err != nil {
				t.Fatalf("OpenBytesAs(%s): %v", fx.file, err)
			}

			var buf bytes.Buffer
			if err := doc.WritePDF(context.Background(), &buf, doctaculous.PDFOptions{Title: fx.file}); err != nil {
				t.Fatalf("WritePDF(%s): %v", fx.file, err)
			}

			out := buf.Bytes()
			if len(out) < 5 || !bytes.HasPrefix(out, []byte("%PDF-")) {
				t.Fatalf("%s: output is not a PDF (len=%d, prefix=%q)", fx.file, len(out), safePrefix(out))
			}
		})
	}
}

func safePrefix(b []byte) string {
	if len(b) > 8 {
		b = b[:8]
	}
	return string(b)
}
