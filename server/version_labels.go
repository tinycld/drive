package drive

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
)

// maxVersionLabel matches drive_item_versions.label's max.
const maxVersionLabel = 500

// restoredFromLabel names the version a restore adds, so the timeline
// shows where the current state came from.
func restoredFromLabel(version *core.Record) string {
	label := fmt.Sprintf("Restored from Version %d", version.GetInt("version_number"))
	if source := version.GetString("label"); source != "" {
		label = "Restored from " + source
	}
	runes := []rune(label)
	if len(runes) > maxVersionLabel {
		label = string(runes[:maxVersionLabel])
	}
	return label
}
