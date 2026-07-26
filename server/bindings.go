package drive

import (
	"github.com/grafana/sobek"
	"github.com/pocketbase/pocketbase"

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
//	$drive.search(userId, { q, limit, offset }) -> { items, total }
func registerJSVMBinding(_ *pocketbase.PocketBase) {
	coreserver.RegisterJSVMBinder(func(vm *sobek.Runtime, app *pocketbase.PocketBase) error {
		search := func(userID string, opts map[string]any) (map[string]any, error) {
			limit, offset := 25, 0
			q := ""
			if v, ok := opts["q"].(string); ok {
				q = v
			}
			if v, ok := opts["limit"].(int64); ok && v > 0 && v <= 100 {
				limit = int(v)
			}
			if v, ok := opts["offset"].(int64); ok && v >= 0 {
				offset = int(v)
			}

			resp, err := searchDriveItems(app, userID, q, limit, offset)
			if err != nil {
				return nil, err
			}

			items := make([]any, len(resp.Items))
			for i, r := range resp.Items {
				items[i] = map[string]any{
					"id":          r.ID,
					"name":        r.Name,
					"is_folder":   r.IsFolder,
					"mime_type":   r.MimeType,
					"size":        r.Size,
					"description": r.Description,
					"updated":     r.Updated,
					"highlight":   r.Highlight,
				}
			}
			return map[string]any{"items": items, "total": resp.Total}, nil
		}

		obj, err := coreserver.NewBindNamespace(vm, map[string]any{"search": search})
		if err != nil {
			return err
		}
		return vm.Set("$drive", obj)
	})
}
