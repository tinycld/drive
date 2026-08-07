package cli

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
	"tinycld.org/cli/ui"
)

// stateRow is the per-user drive_item_state row backing trash and stars.
type stateRow struct {
	ID        string `json:"id"`
	Item      string `json:"item"`
	User      string `json:"user"`
	IsStarred bool   `json:"is_starred"`
	TrashedAt string `json:"trashed_at"`
}

func newRmCmd(c *client.Client) *cobra.Command {
	var permanent bool
	cmd := &cobra.Command{
		Use:   "rm <path>",
		Short: "Trash an item, or delete it permanently",
		Long: "Moves the item to your trash (per-user, restorable in the app). " +
			"--permanent deletes the record — and, for a folder, everything inside it.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, yes, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			ctx := cmd.Context()
			it, err := resolvePath(ctx, c, args[0])
			if err != nil {
				return err
			}
			if it.ID == root.ID {
				return fmt.Errorf("refusing to remove the root")
			}

			question := fmt.Sprintf("Move %q to trash?", args[0])
			if permanent {
				question = fmt.Sprintf("PERMANENTLY delete %q", args[0])
				if it.IsFolder {
					question += " and everything inside it"
				}
				question += "?"
			}
			ok, err := ui.Confirm(o, yes, cmd.InOrStdin(), cmd.ErrOrStderr(), question)
			if err != nil {
				return err
			}
			if !ok {
				return nil
			}

			if permanent {
				err = permanentDelete(ctx, c, it)
			} else {
				err = trashItem(ctx, c, it)
			}
			if err != nil {
				return err
			}
			verb := "trashed"
			if permanent {
				verb = "deleted"
			}
			o.Info(cmd.ErrOrStderr(), "%s %s", verb, args[0])
			return nil
		},
	}
	cmd.Flags().BoolVar(&permanent, "permanent", false, "delete the record instead of trashing")
	return cmd
}

// userState finds the caller's drive_item_state row for an item, if any.
func userState(ctx context.Context, c *client.Client, itemID string) (stateRow, bool, string, error) {
	userID, err := c.UserID(ctx)
	if err != nil {
		return stateRow{}, false, "", err
	}
	res, err := client.ListRecords[stateRow](ctx, c, "drive_item_state", client.ListOptions{
		Filter: client.Filter("item = {:i} && user = {:u}",
			map[string]any{"i": itemID, "u": userID}),
		PerPage:   1,
		SkipTotal: true,
	})
	if err != nil {
		return stateRow{}, false, userID, err
	}
	if len(res.Items) == 0 {
		return stateRow{}, false, userID, nil
	}
	return res.Items[0], true, userID, nil
}

// trashItem mirrors the web's trash mutation: upsert the per-user state row
// with trashed_at stamped. The item record itself is untouched.
func trashItem(ctx context.Context, c *client.Client, it item) error {
	state, found, userID, err := userState(ctx, c, it.ID)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if found {
		_, err = client.UpdateRecord[stateRow](ctx, c, "drive_item_state", state.ID,
			map[string]any{"trashed_at": now})
		return err
	}
	_, err = client.CreateRecord[stateRow](ctx, c, "drive_item_state", map[string]any{
		"item":           it.ID,
		"user":           userID,
		"is_starred":     false,
		"trashed_at":     now,
		"last_viewed_at": "",
	})
	return err
}

// permanentDelete removes the caller's state row (if any) then the item; the
// parent relation cascades, so a folder takes its subtree with it.
func permanentDelete(ctx context.Context, c *client.Client, it item) error {
	state, found, _, err := userState(ctx, c, it.ID)
	if err != nil {
		return err
	}
	if found {
		if err := client.DeleteRecord(ctx, c, "drive_item_state", state.ID); err != nil {
			return err
		}
	}
	return client.DeleteRecord(ctx, c, "drive_items", it.ID)
}
