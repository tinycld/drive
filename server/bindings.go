package drive

import (
	"github.com/grafana/sobek"
	"github.com/pocketbase/pocketbase"

	"encoding/json"
	"tinycld.org/core/coreserver"
)

// registerJSVMBinding installs a `$drive` namespace on every server-side JS VM
// (via core's OnInit binder registry), so package-author `.pb.ts` hooks can call
// drive's Go from TS.
//
// This is the TS→Go direction — the counterpart to the webdavHook points, which
// run Go→TS. Use a binding for logic that must stay in Go (raw SQL, the FTS
// query) but be invokable from customizer TS.
//
// It delegates to the same searchDriveItems the HTTP endpoint uses, so the
// binding cannot drift out of agreement with the endpoint about who may see
// what.
//
// Today it exposes:
//
//	$drive.search(userId, { q, not, limit, offset }) -> { items, total }
func registerJSVMBinding(_ *pocketbase.PocketBase) {
	coreserver.RegisterJSVMBinder(func(vm *sobek.Runtime, app *pocketbase.PocketBase) error {
		search := func(userID string, opts map[string]any) (map[string]any, error) {
			limit, offset := 25, 0
			q := ""
			exclude := ""
			if v, ok := opts["q"].(string); ok {
				q = v
			}
			if v, ok := opts["not"].(string); ok {
				exclude = v
			}
			if v, ok := opts["limit"].(int64); ok && v > 0 && v <= 100 {
				limit = int(v)
			}
			if v, ok := opts["offset"].(int64); ok && v >= 0 {
				offset = int(v)
			}

			resp, err := searchDriveItems(app, userID, q, exclude, limit, offset)
			if err != nil {
				return nil, err
			}

			// Round-trip through JSON so the JS-facing keys come from the
			// api struct tags — one source of truth, no hand-spelled copy.
			marshaled, err := json.Marshal(resp)
			if err != nil {
				return nil, err
			}
			var out map[string]any
			if err := json.Unmarshal(marshaled, &out); err != nil {
				return nil, err
			}
			return out, nil
		}

		obj, err := coreserver.NewBindNamespace(vm, map[string]any{"search": search})
		if err != nil {
			return err
		}
		return vm.Set("$drive", obj)
	})
}
