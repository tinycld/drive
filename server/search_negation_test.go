package drive

import (
	"strings"
	"testing"
)

func TestSanitizeWithExclusions(t *testing.T) {
	got := sanitizeFTSQueryWithExclusions("budget", "draft")
	if !strings.Contains(got, `"budget"*`) {
		t.Errorf("missing include term: %q", got)
	}
	if !strings.Contains(got, `NOT "draft"*`) {
		t.Errorf("missing exclusion: %q", got)
	}
}

func TestExcludeOnlyReturnsEmpty(t *testing.T) {
	if got := sanitizeFTSQueryWithExclusions("", "draft"); got != "" {
		t.Errorf("exclude-only should return empty, got %q", got)
	}
}
