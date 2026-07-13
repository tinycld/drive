package drive

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
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

// TestParseTarget checks the target-format gate: empty defaults to PDF, allowed
// formats resolve, and anything outside the allow-list (images, unknown) fails.
func TestParseTarget(t *testing.T) {
	cases := []struct {
		in      string
		want    doctaculous.Format
		wantErr bool
	}{
		{"", doctaculous.FormatPDF, false},
		{"pdf", doctaculous.FormatPDF, false},
		{"html", doctaculous.FormatHTML, false},
		{"csv", doctaculous.FormatCSV, false},
		{"rtf", doctaculous.FormatRTF, false},
		{"text", doctaculous.FormatText, false},
		{"png", doctaculous.FormatUnknown, true},   // image output not offered
		{"jpeg", doctaculous.FormatUnknown, true},  // image output not offered
		{"tsv", doctaculous.FormatUnknown, true},   // not in the allow-list
		{"bogus", doctaculous.FormatUnknown, true}, // unknown
	}
	for _, c := range cases {
		got, err := parseTarget(c.in)
		if (err != nil) != c.wantErr || got != c.want {
			t.Errorf("parseTarget(%q) = (%q, %v), want (%q, wantErr=%v)", c.in, got, err, c.want, c.wantErr)
		}
	}
}

func TestTargetExt(t *testing.T) {
	cases := map[doctaculous.Format]string{
		doctaculous.FormatPDF:      "pdf",
		doctaculous.FormatHTML:     "html",
		doctaculous.FormatText:     "txt",
		doctaculous.FormatMarkdown: "md",
		doctaculous.FormatCSV:      "csv",
		doctaculous.FormatRTF:      "rtf",
	}
	for f, want := range cases {
		if got := targetExt(f); got != want {
			t.Errorf("targetExt(%q) = %q, want %q", f, got, want)
		}
	}
}

// TestExportConvertsFormats is the load-bearing check for the generalized
// route: real fixtures run through the exact OpenBytesAs -> Write(to) path
// handleExport uses, across several target formats, and produce non-empty
// output with the expected signature.
func TestExportConvertsFormats(t *testing.T) {
	cases := []struct {
		name   string
		file   string
		mime   string
		to     doctaculous.Format
		verify func(t *testing.T, out []byte)
	}{
		{"docx->pdf", "sample.docx", docxMIME, doctaculous.FormatPDF, wantPrefix("%PDF-")},
		{"docx->html", "sample.docx", docxMIME, doctaculous.FormatHTML, wantNonEmpty},
		{"docx->txt", "sample.docx", docxMIME, doctaculous.FormatText, wantNonEmpty},
		{"docx->rtf", "sample.docx", docxMIME, doctaculous.FormatRTF, wantPrefix(`{\rtf`)},
		{"xlsx->pdf", "sample.xlsx", xlsxMIME, doctaculous.FormatPDF, wantPrefix("%PDF-")},
		{"xlsx->csv", "sample.xlsx", xlsxMIME, doctaculous.FormatCSV, wantNonEmpty},
		{"pptx->pdf", "sample.pptx", pptxMIME, doctaculous.FormatPDF, wantPrefix("%PDF-")},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join("..", "tests", "assets", tc.file))
			if err != nil {
				t.Fatalf("read fixture %s: %v", tc.file, err)
			}
			from, err := exportInputFormat(tc.mime, tc.to)
			if err != nil {
				t.Fatalf("exportInputFormat(%q -> %q): %v", tc.mime, tc.to, err)
			}
			doc, err := doctaculous.OpenBytesAs(from, data)
			if err != nil {
				t.Fatalf("OpenBytesAs(%s): %v", tc.file, err)
			}
			var buf bytes.Buffer
			if err := doc.Write(context.Background(), &buf, tc.to, doctaculous.ConvertOptions{}); err != nil {
				t.Fatalf("Write(%s -> %s): %v", tc.file, tc.to, err)
			}
			tc.verify(t, buf.Bytes())
		})
	}
}

func wantPrefix(prefix string) func(*testing.T, []byte) {
	return func(t *testing.T, out []byte) {
		t.Helper()
		if !bytes.HasPrefix(out, []byte(prefix)) {
			t.Fatalf("output missing prefix %q; got %q", prefix, safePrefix(out))
		}
	}
}

func wantNonEmpty(t *testing.T, out []byte) {
	t.Helper()
	if len(bytes.TrimSpace(out)) == 0 {
		t.Fatal("conversion produced empty output")
	}
}

func safePrefix(b []byte) string {
	if len(b) > 8 {
		b = b[:8]
	}
	return string(b)
}

// TestExportSingleSheet verifies WithSheets restricts an xlsx→csv conversion to
// one worksheet — the capability the sheet param wires up — and that an unknown
// sheet name surfaces ErrSheetNotFound (which handleExport maps to a 400). The
// tiny.xlsx fixture has two sheets: "People" and "Incomes" (whose CSV carries a
// distinctive "Table 1" marker).
func TestExportSingleSheet(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "tests", "assets", "tiny.xlsx"))
	if err != nil {
		t.Fatalf("read tiny.xlsx: %v", err)
	}

	toCSV := func(t *testing.T, opts ...doctaculous.OpenOption) string {
		t.Helper()
		doc, err := doctaculous.OpenBytesAs(doctaculous.FormatXLSX, data, opts...)
		if err != nil {
			t.Fatalf("open: %v", err)
		}
		var buf bytes.Buffer
		if err := doc.Write(context.Background(), &buf, doctaculous.FormatCSV, doctaculous.ConvertOptions{}); err != nil {
			t.Fatalf("write csv: %v", err)
		}
		return buf.String()
	}

	// All sheets: both People (Dulce) and Incomes (Table 1) content present.
	all := toCSV(t)
	if !strings.Contains(all, "Dulce") || !strings.Contains(all, "Table 1") {
		t.Fatalf("all-sheets CSV missing expected content:\n%s", all)
	}

	// Single sheet: People content only, Incomes excluded.
	people := toCSV(t, doctaculous.WithSheets("People"))
	if !strings.Contains(people, "Dulce") {
		t.Errorf("People CSV missing People content:\n%s", people)
	}
	if strings.Contains(people, "Table 1") {
		t.Errorf("People CSV leaked Incomes-sheet content:\n%s", people)
	}

	// Unknown sheet → ErrSheetNotFound.
	_, err = doctaculous.OpenBytesAs(doctaculous.FormatXLSX, data, doctaculous.WithSheets("Nope"))
	if !errors.Is(err, doctaculous.ErrSheetNotFound) {
		t.Errorf("unknown sheet: got %v, want ErrSheetNotFound", err)
	}
}
