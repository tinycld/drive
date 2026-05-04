package drive

import "testing"

func TestSplitNameExt(t *testing.T) {
	cases := []struct {
		name     string
		wantBase string
		wantExt  string
	}{
		{"foo.pdf", "foo", ".pdf"},
		{"archive.tar.gz", "archive.tar", ".gz"},
		{"README", "README", ""},
		{".env", ".env", ""},     // leading dot — no extension separator
		{"", "", ""},
		{"a.", "a", "."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotBase, gotExt := splitNameExt(tc.name)
			if gotBase != tc.wantBase || gotExt != tc.wantExt {
				t.Errorf("splitNameExt(%q) = (%q, %q), want (%q, %q)",
					tc.name, gotBase, gotExt, tc.wantBase, tc.wantExt)
			}
		})
	}
}
