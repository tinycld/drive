package drive

import (
	"errors"
	"testing"

	validation "github.com/go-ozzo/ozzo-validation/v4"
)

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

// TestIsDriveItemNameConflict locks down the matcher used by the create-hook
// retry path. It must accept both the raw SQLite "unique constraint failed"
// error string AND the validation.Errors map PocketBase normalizes that into
// before returning from app.Save / e.Next().
func TestIsDriveItemNameConflict(t *testing.T) {
	cases := []struct {
		desc string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"unrelated error", errors.New("db down"), false},
		{
			"raw sqlite error",
			errors.New("UNIQUE constraint failed: drive_items.org, drive_items.parent, drive_items.name"),
			true,
		},
		{
			"normalized validation errors",
			validation.Errors{"name": validation.NewError("validation_not_unique", "Value must be unique")},
			true,
		},
		{
			"validation errors wrapped in errors.Join (PB hook boundary)",
			errors.Join(
				validation.Errors{
					"name":   validation.NewError("validation_not_unique", "Value must be unique"),
					"org":    validation.NewError("validation_not_unique", "Value must be unique"),
					"parent": validation.NewError("validation_not_unique", "Value must be unique"),
				},
			),
			true,
		},
		{
			"validation error on different field",
			validation.Errors{"slug": validation.NewError("validation_not_unique", "Value must be unique")},
			false,
		},
		{
			"name field with wrong code",
			validation.Errors{"name": validation.NewError("validation_required", "Required")},
			false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.desc, func(t *testing.T) {
			if got := isDriveItemNameConflict(tc.err); got != tc.want {
				t.Errorf("isDriveItemNameConflict(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
