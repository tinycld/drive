package drive

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/sharelink"
)

// shareSessionFor creates an active viewer link on item and mints an
// anonymous session for it, the way handleCreateShareSession does.
func shareSessionFor(t *testing.T, app core.App, item, creator *core.Record) (session string, link *core.Record) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("drive_share_links")
	if err != nil {
		t.Fatal(err)
	}
	link = core.NewRecord(col)
	link.Set("item", item.Id)
	link.Set("token", strings.Repeat("a", 32)+item.Id+strings.Repeat("b", 32-len(item.Id)))
	link.Set("created_by", creator.Id)
	link.Set("role", "viewer")
	link.Set("is_active", true)
	if err := app.Save(link); err != nil {
		t.Fatal(err)
	}
	anonID := sharelink.NewAnonID()
	session, err = sharelink.MintSession(app, sharelink.Claims{
		ShareToken:  link.GetString("token"),
		AnonID:      anonID,
		DisplayName: sharelink.DisplayName(anonID),
		Role:        "viewer",
		ItemID:      item.Id,
	})
	if err != nil {
		t.Fatal(err)
	}
	return session, link
}

func getShareAttachment(app core.App, id, session string) *httptest.ResponseRecorder {
	return getFile(app, nil, "/api/drive/share-session/attachments/"+id, id, "?session="+session, handleShareAttachment)
}

// An anonymous share visitor has no file token; the session for the shared
// document is the credential for the images attached to it.
func TestShareAttachment_ServesAnImageAttachedToTheSharedDocument(t *testing.T) {
	publicShareLimiter.Reset()
	e := setupAttached(t)
	session, _ := shareSessionFor(t, e.app, e.doc, e.member)

	rec := getShareAttachment(e.app, e.image.Id, session)

	if rec.Code != http.StatusOK || rec.Body.String() != "png-bytes" {
		t.Fatalf("status = %d body = %q", rec.Code, rec.Body.String())
	}
}

func TestShareAttachment_RefusesAnItemNotAttachedToTheSharedDocument(t *testing.T) {
	publicShareLimiter.Reset()
	e := setupAttached(t)
	other := shareItemWith(t, e.driveGuestEnv, "other.docx", e.collab, "viewer")
	session, _ := shareSessionFor(t, e.app, other, e.member)

	if rec := getShareAttachment(e.app, e.image.Id, session); rec.Code != http.StatusNotFound {
		t.Fatalf("image of another document: status = %d, want 404", rec.Code)
	}
	if rec := getShareAttachment(e.app, other.Id, session); rec.Code != http.StatusNotFound {
		t.Fatalf("the shared document itself: status = %d, want 404", rec.Code)
	}
}

func TestShareAttachment_RefusesABadOrRevokedSession(t *testing.T) {
	publicShareLimiter.Reset()
	e := setupAttached(t)
	session, link := shareSessionFor(t, e.app, e.doc, e.member)

	if rec := getShareAttachment(e.app, e.image.Id, "not-a-session"); rec.Code != http.StatusUnauthorized {
		t.Fatalf("bad session: status = %d, want 401", rec.Code)
	}

	link.Set("is_active", false)
	if err := e.app.Save(link); err != nil {
		t.Fatal(err)
	}
	if rec := getShareAttachment(e.app, e.image.Id, session); rec.Code != http.StatusGone {
		t.Fatalf("revoked link: status = %d, want 410", rec.Code)
	}
}
