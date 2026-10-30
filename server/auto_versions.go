package drive

import (
	"context"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	"tinycld.org/core/editcheckpoint"
	"tinycld.org/core/realtime"
	"tinycld.org/core/versionhooks"
)

// handleEditCheckpoint makes an automatic version when a document reaches a
// checkpoint. The version belongs to the file's owner, whose storage it
// uses; editors names who changed the document since the previous version.
// Every failure is logged and skipped: an automatic version must never
// stop editing.
func handleEditCheckpoint(app core.App) editcheckpoint.Listener {
	return func(ctx context.Context, itemID string, editors editcheckpoint.Editors, reason editcheckpoint.Reason) {
		if err := realtime.FlushItem(itemID); err != nil {
			if errors.Is(err, realtime.ErrReadOnly) || errors.Is(err, realtime.ErrStopping) {
				versionLog.InfoContext(ctx, "auto version skipped: the server cannot write now",
					"itemID", itemID, "reason", reason)
				return
			}
			versionLog.WarnContext(ctx, "auto version flush failed", "itemID", itemID, "err", err)
			return
		}
		item, err := app.FindRecordById("drive_items", itemID)
		if err != nil || item.GetString("file") == "" {
			return
		}
		owner := item.GetString("created_by")
		if err := checkUserStorageQuota(app, owner, int64(item.GetInt("size"))); err != nil {
			// Info, not Warn: an owner over the limit would send one Sentry
			// event per document per checkpoint until they free space.
			versionLog.InfoContext(ctx, "auto version skipped: owner over storage limit", "itemID", itemID)
			return
		}
		version, err := snapshotCurrentFile(app, item, snapshotOpts{UserID: owner, Source: "auto", Editors: editors})
		if err != nil {
			versionLog.WarnContext(ctx, "auto version failed", "itemID", itemID, "err", err)
			return
		}
		if version == nil {
			return
		}
		if hook := versionhooks.For(item.GetString("mime_type")); hook.OnSnapshot != nil {
			if err := hook.OnSnapshot(app, item, version); err != nil {
				versionLog.WarnContext(ctx, "auto version snapshot hook failed", "itemID", itemID, "err", err)
			}
		}
	}
}
