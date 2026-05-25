package drive

import (
	"encoding/json"
	"testing"
)

func TestAnchorMatchesKind(t *testing.T) {
	cases := []struct {
		name string
		kind string
		raw  string
		want bool
	}{
		{"calc ok", "calc_cell", `{"col":"B","row":7}`, true},
		{"calc empty col", "calc_cell", `{"col":"","row":7}`, false},
		{"calc missing row", "calc_cell", `{"col":"B"}`, false},
		{"calc row as string", "calc_cell", `{"col":"B","row":"7"}`, false},
		{"calc wrong shape", "calc_cell", `{"start":0,"end":3}`, false},
		{"text ok", "text_range", `{"start":0,"end":5}`, true},
		{"text start>=end", "text_range", `{"start":5,"end":5}`, false},
		{"text missing end", "text_range", `{"start":0}`, false},
		{"text wrong shape", "text_range", `{"col":"B","row":1}`, false},
		{"empty anchor", "calc_cell", ``, false},
		{"invalid json", "calc_cell", `{nope`, false},
		{"unknown kind", "frobnicate", `{"x":1}`, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := anchorMatchesKind(c.kind, json.RawMessage(c.raw))
			if got != c.want {
				t.Fatalf("anchorMatchesKind(%q, %q) = %v, want %v", c.kind, c.raw, got, c.want)
			}
		})
	}
}
