package drive

import (
	"strings"
	"testing"
)

// The WebDAV tree must not shadow the in-app /drive route: mounting at /drive
// would put a Basic-Auth DAV handler in front of the SPA's own page. /dav is
// reserved for protocol mounts, so no package slug can ever claim it and
// re-create the collision.
//
// In Go rather than a manifest test since the mount moved into webDAVSource —
// the manifest no longer carries a webdav block.
func TestWebDAVPrefixDoesNotShadowTheAppRoute(t *testing.T) {
	prefix := webDAVSource.Prefix
	if prefix != "/dav/drive" {
		t.Errorf("prefix = %q, want /dav/drive", prefix)
	}
	if prefix == "/drive" {
		t.Error("the WebDAV mount shadows the in-app /drive route")
	}
	// Nor may it be a prefix OF the app route, which would swallow /drive/*
	// the same way.
	if strings.HasPrefix("/drive", prefix+"/") {
		t.Errorf("prefix %q swallows the in-app /drive route", prefix)
	}
}
