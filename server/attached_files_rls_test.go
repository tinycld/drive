package drive

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

// attachedEnv is a document owned by member, shared with collab, and an image
// member inserted into it (attached_to = doc). stranger has no share.
type attachedEnv struct {
	*driveGuestEnv
	collab, stranger           *core.Record
	collabToken, strangerToken string
	doc, image                 *core.Record
}

func setupAttached(t *testing.T) *attachedEnv {
	t.Helper()
	env := setupDriveGuestApp(t)
	collab := driveGuestUser(t, env.app, "collab@test.local", "member")
	stranger := driveGuestUser(t, env.app, "stranger@test.local", "member")
	doc := shareItemWith(t, env, "doc.docx", collab, "editor")

	col, err := env.app.FindCollectionByNameOrId("drive_items")
	if err != nil {
		t.Fatal(err)
	}
	f, err := filesystem.NewFileFromBytes([]byte("png-bytes"), "photo.png")
	if err != nil {
		t.Fatal(err)
	}
	image := core.NewRecord(col)
	image.Set("name", "photo.png")
	image.Set("created_by", env.member.Id)
	image.Set("attached_to", doc.Id)
	image.Set("file", f)
	if err := env.app.Save(image); err != nil {
		t.Fatal(err)
	}

	collabToken, err := collab.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	strangerToken, err := stranger.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return &attachedEnv{env, collab, stranger, collabToken, strangerToken, doc, image}
}

func (e *attachedEnv) run(t *testing.T, s *tests.ApiScenario) {
	t.Helper()
	s.TestAppFactory = func(_ testing.TB) *tests.TestApp { return e.app }
	s.DisableTestAppCleanup = true
	s.Test(t)
}

func fileURL(rec *core.Record) string {
	return "/api/files/drive_items/" + rec.Id + "/" + rec.GetString("file")
}

// Someone who can view the document can view an image attached to it, by
// record and by file (with a file token); someone who cannot, cannot.
func TestAttachedImage_VisibleThroughItsDocument(t *testing.T) {
	e := setupAttached(t)

	e.run(t, &tests.ApiScenario{
		Name:            "collab views the attached image record",
		Method:          http.MethodGet,
		URL:             "/api/collections/drive_items/records/" + e.image.Id,
		Headers:         map[string]string{"Authorization": e.collabToken},
		ExpectedStatus:  http.StatusOK,
		ExpectedContent: []string{`"name":"photo.png"`},
	})
	e.run(t, &tests.ApiScenario{
		Name:            "stranger cannot view it",
		Method:          http.MethodGet,
		URL:             "/api/collections/drive_items/records/" + e.image.Id,
		Headers:         map[string]string{"Authorization": e.strangerToken},
		ExpectedStatus:  http.StatusNotFound,
		ExpectedContent: []string{`"data":{}`},
	})

	collabFileToken, err := e.collab.NewFileToken()
	if err != nil {
		t.Fatal(err)
	}
	strangerFileToken, err := e.stranger.NewFileToken()
	if err != nil {
		t.Fatal(err)
	}
	e.run(t, &tests.ApiScenario{
		Name:            "collab fetches the file with a file token",
		Method:          http.MethodGet,
		URL:             fileURL(e.image) + "?token=" + collabFileToken,
		ExpectedStatus:  http.StatusOK,
		ExpectedContent: []string{"png-bytes"},
	})
	e.run(t, &tests.ApiScenario{
		Name:            "stranger's file token is refused",
		Method:          http.MethodGet,
		URL:             fileURL(e.image) + "?token=" + strangerFileToken,
		ExpectedStatus:  http.StatusNotFound,
		ExpectedContent: []string{`"data":{}`},
	})
	e.run(t, &tests.ApiScenario{
		Name:            "no credential: the file is refused",
		Method:          http.MethodGet,
		URL:             fileURL(e.image),
		ExpectedStatus:  http.StatusNotFound,
		ExpectedContent: []string{`"data":{}`},
	})
}

// The attached image stays out of the collaborator's listings: it is
// reachable through the document, not a file shared with them.
func TestAttachedImage_NotListedForTheCollaborator(t *testing.T) {
	e := setupAttached(t)
	e.run(t, &tests.ApiScenario{
		Method:             http.MethodGet,
		URL:                "/api/collections/drive_items/records?filter=" + "name%3D%22photo.png%22",
		Headers:            map[string]string{"Authorization": e.collabToken},
		ExpectedStatus:     http.StatusOK,
		ExpectedContent:    []string{`"totalItems":0`},
		NotExpectedContent: []string{e.image.Id},
	})
}

// Only a user who can edit a document may attach a new item to it.
func TestAttachedImage_CreateNeedsEditOnTheDocument(t *testing.T) {
	e := setupAttached(t)
	e.run(t, &tests.ApiScenario{
		Name:   "stranger cannot attach to the document",
		Method: http.MethodPost,
		URL:    "/api/collections/drive_items/records",
		Body: strings.NewReader(`{"name":"x.png","created_by":"` + e.stranger.Id +
			`","attached_to":"` + e.doc.Id + `"}`),
		Headers:         map[string]string{"Authorization": e.strangerToken, "Content-Type": "application/json"},
		ExpectedStatus:  http.StatusBadRequest,
		ExpectedContent: []string{`"message"`},
	})
	e.run(t, &tests.ApiScenario{
		Name:   "collab (editor) can",
		Method: http.MethodPost,
		URL:    "/api/collections/drive_items/records",
		Body: strings.NewReader(`{"name":"y.png","created_by":"` + e.collab.Id +
			`","attached_to":"` + e.doc.Id + `"}`),
		Headers:         map[string]string{"Authorization": e.collabToken, "Content-Type": "application/json"},
		ExpectedStatus:  http.StatusOK,
		ExpectedContent: []string{`"attached_to":"` + e.doc.Id + `"`},
	})
}

// attached_to is set once, at create: moving an image to another document
// would hand it to that document's viewers.
func TestAttachedImage_AttachmentCannotChange(t *testing.T) {
	e := setupAttached(t)
	other := shareItemWith(t, e.driveGuestEnv, "other.docx", e.collab, "editor")
	e.run(t, &tests.ApiScenario{
		Method:          http.MethodPatch,
		URL:             "/api/collections/drive_items/records/" + e.image.Id,
		Body:            strings.NewReader(`{"attached_to":"` + other.Id + `"}`),
		Headers:         map[string]string{"Authorization": e.memberToken, "Content-Type": "application/json"},
		ExpectedStatus:  http.StatusNotFound,
		ExpectedContent: []string{`"data":{}`},
	})
}

// An image can appear in more than one document (copied and pasted), so
// deleting the document it is attached to must not delete it.
func TestAttachedImage_SurvivesItsDocumentsDeletion(t *testing.T) {
	e := setupAttached(t)
	if err := e.app.Delete(e.doc); err != nil {
		t.Fatal(err)
	}
	if _, err := e.app.FindRecordById("drive_items", e.image.Id); err != nil {
		t.Fatalf("the attached image was deleted with its document: %v", err)
	}
}
