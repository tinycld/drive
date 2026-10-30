package drive

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

// postJSON drives a JSON POST handler and renders a returned ApiError's
// status the way the router would.
func postJSON(app core.App, auth *core.Record, body any, handler func(core.App, *core.RequestEvent) error) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(b))
	rec := httptest.NewRecorder()
	re := &core.RequestEvent{App: app}
	re.Request = req
	re.Response = rec
	re.Auth = auth
	if err := handler(app, re); err != nil {
		var apiErr *router.ApiError
		if errors.As(err, &apiErr) {
			rec.Code = apiErr.Status
		} else {
			rec.Code = http.StatusInternalServerError
		}
	}
	return rec
}
