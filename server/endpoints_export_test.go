package drive

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/nathanstitt/omnidoc/pkg/omnidoc"
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
		_, err := exportInputFormat(c.mime, omnidoc.FormatPDF)
		if (err != nil) != c.wantErr {
			t.Errorf("exportInputFormat(%q): err=%v, wantErr=%v", c.mime, err, c.wantErr)
		}
	}
}

// TestExportConvertsToPDF is the load-bearing check: real office fixtures run
// through the exact OpenBytesAs -> WritePDF path handleExport uses, and produce
// bytes that start with the %PDF- signature. This proves the omnidoc
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

			from, err := exportInputFormat(fx.mime, omnidoc.FormatPDF)
			if err != nil {
				t.Fatalf("exportInputFormat(%q): %v", fx.mime, err)
			}

			doc, err := omnidoc.OpenBytesAs(from, data)
			if err != nil {
				t.Fatalf("OpenBytesAs(%s): %v", fx.file, err)
			}

			var buf bytes.Buffer
			if err := doc.WritePDF(context.Background(), &buf, omnidoc.PDFOptions{Title: fx.file}); err != nil {
				t.Fatalf("WritePDF(%s): %v", fx.file, err)
			}

			out := buf.Bytes()
			if len(out) < 5 || !bytes.HasPrefix(out, []byte("%PDF-")) {
				t.Fatalf("%s: output is not a PDF (len=%d, prefix=%q)", fx.file, len(out), safePrefix(out))
			}
		})
	}
}

// TestExportConvertsToSVG mirrors the PDF check for the second export target:
// the same office fixtures through OpenBytesAs -> WriteSVG produce an SVG
// root element. SVG is output-capable for every input, so this also covers
// the multi-page inputs (xlsx/pptx), which export page 0.
func TestExportConvertsToSVG(t *testing.T) {
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

			from, err := exportInputFormat(fx.mime, omnidoc.FormatSVG)
			if err != nil {
				t.Fatalf("exportInputFormat(%q, svg): %v", fx.mime, err)
			}

			doc, err := omnidoc.OpenBytesAs(from, data)
			if err != nil {
				t.Fatalf("OpenBytesAs(%s): %v", fx.file, err)
			}

			var buf bytes.Buffer
			if err := doc.WriteSVG(context.Background(), &buf, 0, omnidoc.SVGOptions{Title: fx.file}); err != nil {
				t.Fatalf("WriteSVG(%s): %v", fx.file, err)
			}

			if out := buf.Bytes(); !bytes.Contains(out, []byte("<svg")) {
				t.Fatalf("%s: output is not an SVG (len=%d, prefix=%q)", fx.file, len(out), safePrefix(out))
			}
		})
	}
}

// A PDF is a valid SVG *source* even though it is refused as a PDF target,
// so the same-format guard must be per-target, not a blanket PDF refusal.
func TestExportPDFSourceAllowedForSVGTarget(t *testing.T) {
	if _, err := exportInputFormat("application/pdf", omnidoc.FormatPDF); err == nil {
		t.Fatal("pdf -> pdf should be refused (ErrSameFormat)")
	}
	if _, err := exportInputFormat("application/pdf", omnidoc.FormatSVG); err != nil {
		t.Fatalf("pdf -> svg should be allowed, got %v", err)
	}
}

func safePrefix(b []byte) string {
	if len(b) > 8 {
		b = b[:8]
	}
	return string(b)
}
