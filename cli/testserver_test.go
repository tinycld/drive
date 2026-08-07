package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/packages/drive/api"
)

// fakeDrive is an in-memory stand-in for the server: drive_items rows,
// per-user drive_item_state rows, and the bespoke drive endpoints the
// commands hit. Filters are parsed against the exact shapes the CLI builds.
type fakeDrive struct {
	t        *testing.T
	items    map[string]*item
	state    map[string]*stateRow
	contents map[string]string // item ID -> file bytes
	seq      int

	// createdShares counts drive_shares POSTs — the CLI must NEVER create one
	// (the server hook owns the owner row; the unique index would reject it).
	createdShares int

	searchResponse  api.SearchResponse
	usageResponse   api.StorageUsageResponse
	lastSearchQuery url.Values

	// users keyed by email, for share recipient resolution.
	users    map[string]map[string]string
	versions []version
	links    []api.ShareLinkEntry

	lastShareRequest    api.ShareRequest
	lastLinkRequest     api.CreateShareLinkRequest
	revokedLinkID       string
	lastRestoreRequest  api.RestoreVersionRequest
	lastSnapshotRequest api.SnapshotVersionRequest
	lastExportRequest   api.ExportTokenRequest
}

const exportedPDF = "%PDF-1.7 exported bytes"

func newFakeDrive(t *testing.T) *fakeDrive {
	return &fakeDrive{
		t: t, items: map[string]*item{}, state: map[string]*stateRow{},
		contents: map[string]string{},
		users:    map[string]map[string]string{},
	}
}

func (f *fakeDrive) addItem(it item) *item {
	f.seq++
	if it.ID == "" {
		it.ID = fmt.Sprintf("item%03d", f.seq)
	}
	cp := it
	f.items[cp.ID] = &cp
	return &cp
}

func (f *fakeDrive) addFolder(id, parent, name string) *item {
	return f.addItem(item{ID: id, Name: name, IsFolder: true, Parent: parent})
}

func (f *fakeDrive) addFile(id, parent, name, stored, content string) *item {
	it := f.addItem(item{
		ID: id, Name: name, Parent: parent, File: stored,
		Size: int64(len(content)), MimeType: "text/plain",
	})
	f.contents[it.ID] = content
	return it
}

var (
	reParentName   = regexp.MustCompile(`^parent = "((?:[^"\\]|\\.)*)" && name = "((?:[^"\\]|\\.)*)"$`)
	reParentOnly   = regexp.MustCompile(`^parent = "((?:[^"\\]|\\.)*)"$`)
	reUserTrashed  = regexp.MustCompile(`^user = "((?:[^"\\]|\\.)*)" && trashed_at != ''$`)
	reItemUser     = regexp.MustCompile(`^item = "((?:[^"\\]|\\.)*)" && user = "((?:[^"\\]|\\.)*)"$`)
	reIDList       = regexp.MustCompile(`^id = "((?:[^"\\]|\\.)*)"( \|\| id = "(?:(?:[^"\\]|\\.)*)")*$`)
	reIDTerm       = regexp.MustCompile(`id = "((?:[^"\\]|\\.)*)"`)
	reEmailEq      = regexp.MustCompile(`^email = "((?:[^"\\]|\\.)*)"$`)
	reVersionItem  = regexp.MustCompile(`^item = "((?:[^"\\]|\\.)*)" && source != "system"$`)
	reUnquoteSlash = strings.NewReplacer(`\"`, `"`, `\\`, `\`)
)

func unquote(s string) string { return reUnquoteSlash.Replace(s) }

func (f *fakeDrive) listItems(filter string) []item {
	var out []item
	if m := reParentName.FindStringSubmatch(filter); m != nil {
		for _, it := range f.items {
			if it.Parent == unquote(m[1]) && it.Name == unquote(m[2]) {
				out = append(out, *it)
			}
		}
		return out
	}
	if m := reParentOnly.FindStringSubmatch(filter); m != nil {
		for _, it := range f.items {
			if it.Parent == unquote(m[1]) {
				out = append(out, *it)
			}
		}
		return out
	}
	if reIDList.MatchString(filter) {
		want := map[string]bool{}
		for _, m := range reIDTerm.FindAllStringSubmatch(filter, -1) {
			want[unquote(m[1])] = true
		}
		for _, it := range f.items {
			if want[it.ID] {
				out = append(out, *it)
			}
		}
		return out
	}
	f.t.Errorf("unsupported drive_items filter: %q", filter)
	return nil
}

func (f *fakeDrive) listState(filter string) []stateRow {
	var out []stateRow
	if m := reUserTrashed.FindStringSubmatch(filter); m != nil {
		for _, s := range f.state {
			if s.User == unquote(m[1]) && s.TrashedAt != "" {
				out = append(out, *s)
			}
		}
		return out
	}
	if m := reItemUser.FindStringSubmatch(filter); m != nil {
		for _, s := range f.state {
			if s.Item == unquote(m[1]) && s.User == unquote(m[2]) {
				out = append(out, *s)
			}
		}
		return out
	}
	f.t.Errorf("unsupported drive_item_state filter: %q", filter)
	return nil
}

func listResponse[T any](w http.ResponseWriter, items []T) {
	if items == nil {
		items = []T{}
	}
	json.NewEncoder(w).Encode(map[string]any{
		"page": 1, "perPage": 200, "totalItems": len(items), "totalPages": 1,
		"items": items,
	})
}

// serve builds the httptest server and a Client pointed at it.
func (f *fakeDrive) serve() (*httptest.Server, *client.Client) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /oauth/userinfo", func(w http.ResponseWriter, _ *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"sub": "user1"})
	})
	mux.HandleFunc("GET /api/collections/drive_items/records", func(w http.ResponseWriter, r *http.Request) {
		items := f.listItems(r.URL.Query().Get("filter"))
		if s := r.URL.Query().Get("sort"); s != "" {
			if s != "-is_folder,name" {
				f.t.Errorf("unsupported sort: %q", s)
			}
			sort.Slice(items, func(i, j int) bool {
				if items[i].IsFolder != items[j].IsFolder {
					return items[i].IsFolder
				}
				return items[i].Name < items[j].Name
			})
		}
		listResponse(w, items)
	})
	mux.HandleFunc("GET /api/collections/drive_items/records/{id}", func(w http.ResponseWriter, r *http.Request) {
		it, ok := f.items[r.PathValue("id")]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"message": "Not found"})
			return
		}
		json.NewEncoder(w).Encode(it)
	})
	mux.HandleFunc("POST /api/collections/drive_items/records", func(w http.ResponseWriter, r *http.Request) {
		fields := map[string]string{}
		var fileBytes []byte
		ct := r.Header.Get("Content-Type")
		if strings.HasPrefix(ct, "multipart/form-data") {
			if err := r.ParseMultipartForm(1 << 20); err != nil {
				f.t.Errorf("multipart parse: %v", err)
			}
			for k, v := range r.MultipartForm.Value {
				fields[k] = v[0]
			}
			if fh := r.MultipartForm.File["file"]; len(fh) > 0 {
				src, _ := fh[0].Open()
				fileBytes, _ = io.ReadAll(src)
				src.Close()
			}
		} else {
			var body map[string]any
			json.NewDecoder(r.Body).Decode(&body)
			for k, v := range body {
				fields[k] = fmt.Sprint(v)
			}
		}
		// The create hook recomputes size from bytes and dedups the name —
		// emulate dedup by suffixing when a sibling name collides.
		name := fields["name"]
		for _, it := range f.items {
			if it.Parent == fields["parent"] && it.Name == name {
				name = "copy-of-" + name
			}
		}
		created := f.addItem(item{
			Name:      name,
			IsFolder:  fields["is_folder"] == "true",
			MimeType:  fields["mime_type"],
			Parent:    fields["parent"],
			Size:      int64(len(fileBytes)),
			File:      storedName(name, fileBytes),
			CreatedBy: fields["created_by"],
		})
		if fileBytes != nil {
			f.contents[created.ID] = string(fileBytes)
		}
		json.NewEncoder(w).Encode(created)
	})
	mux.HandleFunc("PATCH /api/collections/drive_items/records/{id}", func(w http.ResponseWriter, r *http.Request) {
		it, ok := f.items[r.PathValue("id")]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		if v, ok := body["parent"].(string); ok {
			it.Parent = v
		}
		if v, ok := body["name"].(string); ok {
			it.Name = v
		}
		json.NewEncoder(w).Encode(it)
	})
	mux.HandleFunc("DELETE /api/collections/drive_items/records/{id}", func(w http.ResponseWriter, r *http.Request) {
		delete(f.items, r.PathValue("id"))
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /api/collections/drive_item_state/records", func(w http.ResponseWriter, r *http.Request) {
		listResponse(w, f.listState(r.URL.Query().Get("filter")))
	})
	mux.HandleFunc("POST /api/collections/drive_item_state/records", func(w http.ResponseWriter, r *http.Request) {
		var body stateRow
		json.NewDecoder(r.Body).Decode(&body)
		f.seq++
		body.ID = fmt.Sprintf("state%03d", f.seq)
		f.state[body.ID] = &body
		json.NewEncoder(w).Encode(body)
	})
	mux.HandleFunc("PATCH /api/collections/drive_item_state/records/{id}", func(w http.ResponseWriter, r *http.Request) {
		s, ok := f.state[r.PathValue("id")]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		if v, ok := body["trashed_at"].(string); ok {
			s.TrashedAt = v
		}
		json.NewEncoder(w).Encode(s)
	})
	mux.HandleFunc("DELETE /api/collections/drive_item_state/records/{id}", func(w http.ResponseWriter, r *http.Request) {
		delete(f.state, r.PathValue("id"))
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/collections/drive_shares/records", func(w http.ResponseWriter, _ *http.Request) {
		f.createdShares++
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"message": "owner share is server-created"})
	})

	mux.HandleFunc("GET /api/collections/users/records", func(w http.ResponseWriter, r *http.Request) {
		m := reEmailEq.FindStringSubmatch(r.URL.Query().Get("filter"))
		if m == nil {
			f.t.Errorf("unsupported users filter: %q", r.URL.Query().Get("filter"))
		}
		var out []map[string]string
		if u, ok := f.users[unquote(m[1])]; ok {
			out = append(out, u)
		}
		listResponse(w, out)
	})
	mux.HandleFunc("GET /api/collections/drive_item_versions/records", func(w http.ResponseWriter, r *http.Request) {
		m := reVersionItem.FindStringSubmatch(r.URL.Query().Get("filter"))
		if m == nil {
			f.t.Errorf("unsupported versions filter: %q", r.URL.Query().Get("filter"))
		}
		var out []version
		for _, v := range f.versions {
			if v.Item == unquote(m[1]) && v.Source != "system" {
				out = append(out, v)
			}
		}
		sort.Slice(out, func(i, j int) bool { return out[i].VersionNumber > out[j].VersionNumber })
		listResponse(w, out)
	})

	mux.HandleFunc("POST /api/drive/share", func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&f.lastShareRequest)
		created := 0
		for _, rec := range f.lastShareRequest.Recipients {
			if rec.UserID != "" {
				created++
			}
		}
		json.NewEncoder(w).Encode(api.ShareResponse{SharesCreated: created})
	})
	mux.HandleFunc("POST /api/drive/share-link", func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&f.lastLinkRequest)
		f.seq++
		id := fmt.Sprintf("link%03d", f.seq)
		token := fmt.Sprintf("token%03d", f.seq)
		entry := api.ShareLinkEntry{
			ID: id, Token: token, URL: "/share/" + token,
			Role: f.lastLinkRequest.Role, IsActive: true,
			ExpiresAt: f.lastLinkRequest.ExpiresAt,
		}
		f.links = append(f.links, entry)
		json.NewEncoder(w).Encode(api.ShareLinkResponse{ID: id, Token: token, URL: entry.URL})
	})
	mux.HandleFunc("GET /api/drive/share-links", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("item_id") == "" {
			f.t.Error("share-links requires item_id")
		}
		json.NewEncoder(w).Encode(api.ShareLinkListResponse{Links: f.links})
	})
	mux.HandleFunc("DELETE /api/drive/share-link/{id}", func(w http.ResponseWriter, r *http.Request) {
		for i := range f.links {
			if f.links[i].ID == r.PathValue("id") {
				f.links[i].IsActive = false // soft revoke, as the server does
			}
		}
		f.revokedLinkID = r.PathValue("id")
		json.NewEncoder(w).Encode(api.SuccessResponse{Success: true})
	})

	mux.HandleFunc("POST /api/drive/versions/restore", func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&f.lastRestoreRequest)
		it := f.items[f.lastRestoreRequest.Item]
		json.NewEncoder(w).Encode(api.VersionFileResponse{
			ID: it.ID, Name: it.Name, File: it.File, Size: it.Size, MimeType: it.MimeType,
		})
	})
	mux.HandleFunc("POST /api/drive/versions/snapshot", func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&f.lastSnapshotRequest)
		next := 1
		for _, v := range f.versions {
			if v.Item == f.lastSnapshotRequest.Item && v.VersionNumber >= next {
				next = v.VersionNumber + 1
			}
		}
		f.seq++
		f.versions = append(f.versions, version{
			ID: fmt.Sprintf("ver%03d", f.seq), Item: f.lastSnapshotRequest.Item,
			VersionNumber: next, Source: "user", Label: f.lastSnapshotRequest.Label,
		})
		json.NewEncoder(w).Encode(api.SnapshotVersionResponse{Item: f.lastSnapshotRequest.Item})
	})

	mux.HandleFunc("POST /api/drive/export-token", func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&f.lastExportRequest)
		json.NewEncoder(w).Encode(api.TokenResponse{
			Token: "exp123", URL: "/api/drive/export?token=exp123",
		})
	})
	mux.HandleFunc("GET /api/drive/export", func(w http.ResponseWriter, r *http.Request) {
		// Credential-less by design: the single-use token IS the credential.
		if r.Header.Get("Authorization") != "" {
			f.t.Error("export download must not carry a bearer token")
		}
		w.Header().Set("Content-Length", strconv.Itoa(len(exportedPDF)))
		w.Write([]byte(exportedPDF))
	})

	mux.HandleFunc("GET /api/drive/search", func(w http.ResponseWriter, r *http.Request) {
		f.lastSearchQuery = r.URL.Query()
		json.NewEncoder(w).Encode(f.searchResponse)
	})
	mux.HandleFunc("GET /api/drive/storage-usage", func(w http.ResponseWriter, _ *http.Request) {
		json.NewEncoder(w).Encode(f.usageResponse)
	})

	mux.HandleFunc("GET /api/files/drive_items/{id}/{file}", func(w http.ResponseWriter, r *http.Request) {
		it, ok := f.items[r.PathValue("id")]
		if !ok || it.File != r.PathValue("file") {
			// Wrong stored name (e.g. built from item.Name) must 404, exactly
			// like PocketBase.
			w.WriteHeader(http.StatusNotFound)
			return
		}
		content := f.contents[it.ID]
		w.Header().Set("Content-Length", strconv.Itoa(len(content)))
		w.Write([]byte(content))
	})

	srv := httptest.NewServer(mux)
	f.t.Cleanup(srv.Close)
	store := &staticStore{tok: client.TokenSet{
		AccessToken: "test-token", RefreshToken: "r", ExpiresAt: time.Now().Add(time.Hour),
	}}
	return srv, client.New(srv.URL, store, srv.Client())
}

// storedName derives a deterministic "sanitized+suffixed" stored file name so
// tests exercise the file-vs-name distinction.
func storedName(name string, body []byte) string {
	if body == nil {
		return ""
	}
	return strings.ReplaceAll(name, " ", "_") + "_suffix0123"
}

type staticStore struct{ tok client.TokenSet }

func (s *staticStore) Load() (client.TokenSet, error) { return s.tok, nil }
func (s *staticStore) Save(t client.TokenSet) error   { s.tok = t; return nil }

// newTestRoot mirrors the shell root's persistent flag set (the contract
// output.FromCommand reads) and registers the drive group.
func newTestRoot(c *client.Client) *cobra.Command {
	root := &cobra.Command{Use: "tinycld", SilenceUsage: true, SilenceErrors: true}
	pf := root.PersistentFlags()
	pf.String("output", "table", "")
	pf.Bool("json", false, "")
	pf.String("context", "", "")
	pf.Bool("quiet", false, "")
	pf.Bool("no-color", false, "")
	pf.Bool("yes", false, "")
	Register(root, c)
	return root
}

func runCmd(t *testing.T, c *client.Client, args ...string) (string, string, error) {
	t.Helper()
	root := newTestRoot(c)
	var out, errBuf bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&errBuf)
	root.SetIn(strings.NewReader(""))
	root.SetArgs(args)
	err := root.Execute()
	return out.String(), errBuf.String(), err
}
