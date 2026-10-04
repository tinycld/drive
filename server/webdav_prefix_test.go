package drive

import (
	"strings"
	"testing"
)

// The mount is /drive — what someone types when connecting from Finder or
// Explorer. It deliberately shadows the SPA catch-all at that exact path (a
// literal route wins), which is safe because the app's own Drive route is
// /a/drive and nothing links the bare path.
//
// What it must NOT do is sit under a namespace core reserves for
// infrastructure: /api is PocketBase's REST API, /_ its dashboard,
// /.well-known protocol discovery. core/davprefix rejects those at
// registration; this pins the prefix itself so a well-meaning edit cannot
// quietly move the mount somewhere a client would have to be told about.
func TestWebDAVPrefix(t *testing.T) {
	prefix := webDAVSource.Prefix

	if prefix != "/drive" {
		t.Errorf("prefix = %q, want /drive", prefix)
	}
	if !strings.HasPrefix(prefix, "/") || strings.HasSuffix(prefix, "/") {
		t.Errorf("prefix %q must start with a slash and not end with one", prefix)
	}
	for _, reserved := range []string{"/api", "/_", "/.well-known"} {
		if prefix == reserved || strings.HasPrefix(prefix, reserved+"/") {
			t.Errorf("prefix %q shadows the reserved %s namespace", prefix, reserved)
		}
	}
}
