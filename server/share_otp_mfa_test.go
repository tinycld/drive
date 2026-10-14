package drive

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
	"tinycld.org/core/authfactor"
)

// An emailed share-link code proves only that the visitor reads the mailbox.
// For an account with a second factor that must not become a session: the
// mailbox alone would skip the second step.
func TestShareOTPVerify_RefusesAnAccountWithASecondFactor(t *testing.T) {
	env := setupOTPApp(t, "commentor")
	tok := env.shareLink.GetString("token")
	member := otpTestUser(t, env.app, "secured@example.com", "member")
	enableTOTPForTest(t, env.app, member.Id)

	resp, body := env.doRequest(t, http.MethodPost,
		"/api/drive/share-link/"+tok+"/otp-request", `{"email":"secured@example.com"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("otp-request: %d %s", resp.StatusCode, body)
	}
	var out struct {
		OTPID string `json:"otp_id"`
	}
	_ = json.Unmarshal(body, &out)

	verify := fmt.Sprintf(`{"email":"secured@example.com","code":%q,"otp_id":%q}`, env.captureCode(), out.OTPID)
	resp, body = env.doRequest(t, http.MethodPost, "/api/drive/share-link/"+tok+"/otp-verify", verify)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("otp-verify for an MFA account: %d %s", resp.StatusCode, body)
	}
	if strings.Contains(string(body), `"token"`) {
		t.Fatal("a session token was returned")
	}
	if !strings.Contains(string(body), "two-step verification") {
		t.Fatalf("missing the sign-in message: %s", body)
	}
}

// enableTOTPForTest gives userID a confirmed authenticator app. The drive test
// app does not run core's migrations, so the collection is created here with
// the fields authfactor reads.
func enableTOTPForTest(t *testing.T, app core.App, userID string) {
	t.Helper()
	col, err := app.FindCollectionByNameOrId(authfactor.TOTPCollection)
	if err != nil {
		col = core.NewBaseCollection(authfactor.TOTPCollection)
		col.Fields.Add(&core.TextField{Name: "user"})
		col.Fields.Add(&core.DateField{Name: "enabled_at"})
		if err := app.Save(col); err != nil {
			t.Fatalf("create %s: %v", authfactor.TOTPCollection, err)
		}
	}
	row := core.NewRecord(col)
	row.Set("user", userID)
	row.Set("enabled_at", types.NowDateTime())
	if err := app.Save(row); err != nil {
		t.Fatalf("save totp row: %v", err)
	}
}
