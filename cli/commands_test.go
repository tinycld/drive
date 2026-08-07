package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"tinycld.org/packages/drive/api"
)

// tree builds the standard fixture:
//
//	/docs (folder)
//	/docs/report.pdf
//	/docs/notes (folder)
//	/loose.txt
func tree(t *testing.T) *fakeDrive {
	f := newFakeDrive(t)
	f.addFolder("fldDocs", "", "docs")
	f.addFile("filReport", "fldDocs", "report.pdf", "report_ab12cd34ef.pdf", "report-bytes")
	f.addFolder("fldNotes", "fldDocs", "notes")
	f.addFile("filLoose", "", "loose.txt", "loose_ab12cd34ef.txt", "loose-bytes")
	return f
}

func TestResolvePath(t *testing.T) {
	f := tree(t)
	_, c := f.serve()
	ctx := t.Context()

	cases := []struct {
		path, wantID string
		wantErr      bool
	}{
		{"/", "", false},
		{"", "", false},
		{"/docs", "fldDocs", false},
		{"docs", "fldDocs", false},
		{"/docs/", "fldDocs", false},
		{"/docs/report.pdf", "filReport", false},
		{"/docs/notes", "fldNotes", false},
		{"/docs/missing.txt", "", true},
		{"/missing", "", true},
		{"id:filLoose", "filLoose", false},
		{"id:absent", "", true},
	}
	for _, tc := range cases {
		it, err := resolvePath(ctx, c, tc.path)
		if tc.wantErr {
			if err == nil {
				t.Errorf("resolvePath(%q) succeeded, want error", tc.path)
			}
			continue
		}
		if err != nil {
			t.Errorf("resolvePath(%q): %v", tc.path, err)
			continue
		}
		if it.ID != tc.wantID {
			t.Errorf("resolvePath(%q) = %q, want %q", tc.path, it.ID, tc.wantID)
		}
	}
}

func TestResolvePathCyclicParentChain(t *testing.T) {
	// A consistent tree cannot revisit an id on a downward walk (each hop
	// matches on parent == current), so this simulates DB corruption: a
	// second row claims the folder's own ID as a child of itself. The guard
	// must error out instead of treating the revisit as progress.
	f := newFakeDrive(t)
	f.addFolder("fldLoop", "", "loop")
	f.items["corrupt"] = &item{ID: "fldLoop", Parent: "fldLoop", Name: "loop", IsFolder: true}
	_, c := f.serve()

	if _, err := resolvePath(t.Context(), c, "/loop/loop"); err == nil ||
		!strings.Contains(err.Error(), "cyclic") {
		t.Fatalf("err = %v, want cyclic parent chain", err)
	}
}

func TestResolvePathDepthCap(t *testing.T) {
	f := newFakeDrive(t)
	_, c := f.serve()
	deep := strings.Repeat("/x", maxPathDepth+1)
	if _, err := resolvePath(t.Context(), c, deep); err == nil ||
		!strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("err = %v, want depth-cap error", err)
	}
}

func TestLsTableAndJSON(t *testing.T) {
	f := tree(t)
	_, c := f.serve()

	out, _, err := runCmd(t, c, "drive", "ls", "/docs", "--long")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "report.pdf") || !strings.Contains(out, "notes") {
		t.Fatalf("ls output:\n%s", out)
	}
	// Folders sort first.
	if strings.Index(out, "notes") > strings.Index(out, "report.pdf") {
		t.Fatalf("folders must sort before files:\n%s", out)
	}

	out, _, err = runCmd(t, c, "drive", "ls", "/docs", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var items []item
	if err := json.Unmarshal([]byte(out), &items); err != nil {
		t.Fatalf("--json output is not a stable JSON array: %v\n%s", err, out)
	}
	if len(items) != 2 {
		t.Fatalf("items = %+v", items)
	}
}

func TestLsHidesTrashedUnlessAll(t *testing.T) {
	f := tree(t)
	f.state["s1"] = &stateRow{ID: "s1", Item: "filReport", User: "user1", TrashedAt: "2026-08-06 00:00:00Z"}
	_, c := f.serve()

	out, _, err := runCmd(t, c, "drive", "ls", "/docs")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out, "report.pdf") {
		t.Fatalf("trashed item listed without --all:\n%s", out)
	}
	out, _, err = runCmd(t, c, "drive", "ls", "/docs", "--all")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "report.pdf") {
		t.Fatalf("--all must include trashed items:\n%s", out)
	}
}

func TestCatStreamsStoredFile(t *testing.T) {
	f := tree(t)
	_, c := f.serve()

	out, _, err := runCmd(t, c, "drive", "cat", "/docs/report.pdf")
	if err != nil {
		t.Fatal(err)
	}
	if out != "report-bytes" {
		t.Fatalf("cat = %q", out)
	}
	if _, _, err := runCmd(t, c, "drive", "cat", "/docs"); err == nil {
		t.Fatal("cat on a folder must error")
	}
}

func TestGetDownloadsToDest(t *testing.T) {
	f := tree(t)
	_, c := f.serve()
	dir := t.TempDir()

	dest := filepath.Join(dir, "saved.pdf")
	if _, _, err := runCmd(t, c, "drive", "get", "/docs/report.pdf", dest); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(dest)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "report-bytes" {
		t.Fatalf("content = %q", got)
	}
}

func TestPutUploadsAndReportsServerName(t *testing.T) {
	f := tree(t)
	_, c := f.serve()
	local := filepath.Join(t.TempDir(), "report.pdf")
	os.WriteFile(local, []byte("new-bytes"), 0o600)

	// Same name already exists in /docs — the server "hook" dedups; the CLI
	// must report the server's final name, not its own.
	_, stderr, err := runCmd(t, c, "drive", "put", local, "/docs")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(stderr, "copy-of-report.pdf") {
		t.Fatalf("must report the deduplicated server name, got:\n%s", stderr)
	}
	if f.createdShares != 0 {
		t.Fatal("the CLI must never create a drive_shares row — the server hook owns it")
	}
	// Size recomputed server-side from actual bytes.
	for _, it := range f.items {
		if it.Name == "copy-of-report.pdf" && it.Size != int64(len("new-bytes")) {
			t.Fatalf("uploaded size = %d", it.Size)
		}
	}
}

func TestPutRefusesOverwrite(t *testing.T) {
	f := tree(t)
	_, c := f.serve()
	local := filepath.Join(t.TempDir(), "x.txt")
	os.WriteFile(local, []byte("x"), 0o600)

	if _, _, err := runCmd(t, c, "drive", "put", local, "/loose.txt"); err == nil {
		t.Fatal("put onto an existing file must refuse")
	}
}

func TestMkdirParents(t *testing.T) {
	f := tree(t)
	_, c := f.serve()

	if _, _, err := runCmd(t, c, "drive", "mkdir", "/a/b/c"); err == nil {
		t.Fatal("mkdir with missing intermediates must fail without --parents")
	}
	if _, _, err := runCmd(t, c, "drive", "mkdir", "/a/b/c", "--parents"); err != nil {
		t.Fatal(err)
	}
	it, err := resolvePath(t.Context(), c, "/a/b/c")
	if err != nil || !it.IsFolder {
		t.Fatalf("chain not created: %+v %v", it, err)
	}
	if _, _, err := runCmd(t, c, "drive", "mkdir", "/docs"); err == nil {
		t.Fatal("mkdir on an existing path must error")
	}
}

func TestMvIntoFolderAndRename(t *testing.T) {
	f := tree(t)
	_, c := f.serve()

	if _, _, err := runCmd(t, c, "drive", "mv", "/loose.txt", "/docs"); err != nil {
		t.Fatal(err)
	}
	if f.items["filLoose"].Parent != "fldDocs" {
		t.Fatalf("parent = %q", f.items["filLoose"].Parent)
	}

	if _, _, err := runCmd(t, c, "drive", "mv", "/docs/loose.txt", "/renamed.txt"); err != nil {
		t.Fatal(err)
	}
	if f.items["filLoose"].Parent != "" || f.items["filLoose"].Name != "renamed.txt" {
		t.Fatalf("after rename: %+v", f.items["filLoose"])
	}
}

func TestCpRoundTripsBytes(t *testing.T) {
	f := tree(t)
	_, c := f.serve()

	if _, _, err := runCmd(t, c, "drive", "cp", "/docs/report.pdf", "/docs/notes"); err != nil {
		t.Fatal(err)
	}
	copied, err := resolvePath(t.Context(), c, "/docs/notes/report.pdf")
	if err != nil {
		t.Fatal(err)
	}
	if f.contents[copied.ID] != "report-bytes" {
		t.Fatalf("copied content = %q", f.contents[copied.ID])
	}
	if _, _, err := runCmd(t, c, "drive", "cp", "/docs", "/elsewhere"); err == nil {
		t.Fatal("cp of a folder must refuse")
	}
}

func TestRmTrashesByDefaultAndDeletesWithPermanent(t *testing.T) {
	f := tree(t)
	_, c := f.serve()

	// Non-TTY without --yes must refuse rather than hang or proceed.
	if _, _, err := runCmd(t, c, "drive", "rm", "/loose.txt"); err == nil {
		t.Fatal("rm without --yes on a non-TTY must refuse")
	}

	if _, _, err := runCmd(t, c, "drive", "rm", "/loose.txt", "--yes"); err != nil {
		t.Fatal(err)
	}
	if _, ok := f.items["filLoose"]; !ok {
		t.Fatal("trash must not delete the record")
	}
	trashed := false
	for _, s := range f.state {
		if s.Item == "filLoose" && s.User == "user1" && s.TrashedAt != "" {
			trashed = true
		}
	}
	if !trashed {
		t.Fatalf("no trashed state row: %+v", f.state)
	}

	if _, _, err := runCmd(t, c, "drive", "rm", "/docs/report.pdf", "--permanent", "--yes"); err != nil {
		t.Fatal(err)
	}
	if _, ok := f.items["filReport"]; ok {
		t.Fatal("--permanent must delete the record")
	}
}

func TestSearchMapsFlagsAndStripsMarks(t *testing.T) {
	f := newFakeDrive(t)
	f.searchResponse = api.SearchResponse{
		Items: []api.SearchResultItem{{
			ID: "r1", Name: "invoice.pdf", Size: 2048,
			Highlight: "the <mark>invoice</mark> total",
		}},
		Total: 1,
	}
	_, c := f.serve()

	out, _, err := runCmd(t, c, "drive", "search", "invoice", "--limit", "5", "--offset", "10")
	if err != nil {
		t.Fatal(err)
	}
	q := f.lastSearchQuery
	if q.Get("q") != "invoice" || q.Get("limit") != "5" || q.Get("offset") != "10" {
		t.Fatalf("query = %v", q)
	}
	if strings.Contains(out, "<mark>") {
		t.Fatalf("table output must strip <mark>:\n%s", out)
	}
	if !strings.Contains(out, "2.0 KB") {
		t.Fatalf("sizes must be humanized:\n%s", out)
	}

	out, _, err = runCmd(t, c, "drive", "search", "invoice", "--json")
	if err != nil {
		t.Fatal(err)
	}
	var resp api.SearchResponse
	if err := json.Unmarshal([]byte(out), &resp); err != nil {
		t.Fatalf("--json is not the raw response: %v", err)
	}
	if resp.Items[0].Highlight != "the <mark>invoice</mark> total" {
		t.Fatal("--json must keep the raw highlight markup")
	}
}

func TestUsageRendersHumanSizes(t *testing.T) {
	f := newFakeDrive(t)
	f.usageResponse = api.StorageUsageResponse{
		UserUsedBytes: 1536, OrgDriveBytes: 1048576, OrgMailBytes: 0,
		LimitBytes: 5 * 1024 * 1024 * 1024, HasLimit: true,
	}
	_, c := f.serve()

	out, _, err := runCmd(t, c, "drive", "usage")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"1.5 KB", "1.0 MB", "5.0 GB"} {
		if !strings.Contains(out, want) {
			t.Errorf("usage output missing %q:\n%s", want, out)
		}
	}

	f.usageResponse.HasLimit = false
	out, _, err = runCmd(t, c, "drive", "usage")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "unlimited") {
		t.Fatalf("no-limit deployments must say unlimited:\n%s", out)
	}
}
