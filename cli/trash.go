package cli

import (
	"context"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

func newTrashCmd(c *client.Client) *cobra.Command {
	return &cobra.Command{
		Use:   "trash",
		Short: "List items in your trash",
		Long: "Lists the items YOU have trashed. Trash is flat and per-item: " +
			"trashing a folder does not stamp its children, so a trashed child " +
			"and its trashed parent appear as separate rows.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			ctx := cmd.Context()
			trashed, err := trashedItemIDs(ctx, c)
			if err != nil {
				return err
			}
			items, err := itemsByIDs(ctx, c, trashed)
			if err != nil {
				return err
			}
			return writeItems(cmd, o, items, true)
		},
	}
}

func newRestoreCmd(c *client.Client) *cobra.Command {
	return &cobra.Command{
		Use:   "restore <path|id:...>",
		Short: "Restore an item from your trash",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			ctx := cmd.Context()
			// A trashed item is still a normal row, so path resolution works —
			// but its parent chain may itself be trashed, which is why id: is
			// the reliable form (and what `drive trash` prints).
			it, err := resolvePath(ctx, c, args[0])
			if err != nil {
				return err
			}
			state, found, _, err := userState(ctx, c, it.ID)
			if err != nil {
				return err
			}
			if !found || state.TrashedAt == "" {
				o.Info(cmd.ErrOrStderr(), "%s is not in your trash", args[0])
				return nil
			}
			_, err = client.UpdateRecord[stateRow](ctx, c, "drive_item_state", state.ID,
				map[string]any{"trashed_at": ""})
			if err != nil {
				return err
			}
			o.Info(cmd.ErrOrStderr(), "restored %s", it.Name)
			return nil
		},
	}
}

// itemsByIDs fetches items by id in one filter per batch. PocketBase has no
// `in` operator over a literal list, so the ids are OR-ed; batching keeps the
// query string bounded.
func itemsByIDs(ctx context.Context, c *client.Client, ids map[string]bool) ([]item, error) {
	const batch = 40
	var all []item
	var pending []string
	flush := func() error {
		if len(pending) == 0 {
			return nil
		}
		clauses := make([]string, len(pending))
		for i, id := range pending {
			clauses[i] = client.Filter("id = {:i}", map[string]any{"i": id})
		}
		items, err := client.ListAll[item](ctx, c, "drive_items",
			strings.Join(clauses, " || "), "-is_folder,name")
		if err != nil {
			return err
		}
		all = append(all, items...)
		pending = pending[:0]
		return nil
	}
	for id := range ids {
		pending = append(pending, id)
		if len(pending) == batch {
			if err := flush(); err != nil {
				return nil, err
			}
		}
	}
	if err := flush(); err != nil {
		return nil, err
	}
	return all, nil
}
