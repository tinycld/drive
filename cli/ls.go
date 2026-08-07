package cli

import (
	"context"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

func newLsCmd(c *client.Client) *cobra.Command {
	var long, all bool
	cmd := &cobra.Command{
		Use:   "ls [path]",
		Short: "List a folder",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			path := "/"
			if len(args) == 1 {
				path = args[0]
			}
			ctx := cmd.Context()
			target, err := resolvePath(ctx, c, path)
			if err != nil {
				return err
			}

			items := []item{target}
			if target.IsFolder {
				items, err = client.ListAll[item](ctx, c, "drive_items",
					client.Filter("parent = {:p}", map[string]any{"p": target.ID}),
					"-is_folder,name")
				if err != nil {
					return err
				}
			}
			if !all {
				items, err = withoutTrashed(ctx, c, items)
				if err != nil {
					return err
				}
			}
			return writeItems(cmd, o, items, long)
		},
	}
	cmd.Flags().BoolVarP(&long, "long", "l", false, "show size, type, and modification time")
	cmd.Flags().BoolVarP(&all, "all", "a", false, "include trashed items")
	return cmd
}

// withoutTrashed drops items the CALLING user has trashed — trash state is
// per-user (drive_item_state), not a column on the item.
func withoutTrashed(ctx context.Context, c *client.Client, items []item) ([]item, error) {
	userID, err := c.UserID(ctx)
	if err != nil {
		return nil, err
	}
	type stateRow struct {
		Item      string `json:"item"`
		TrashedAt string `json:"trashed_at"`
	}
	states, err := client.ListAll[stateRow](ctx, c, "drive_item_state",
		client.Filter("user = {:u} && trashed_at != ''", map[string]any{"u": userID}), "")
	if err != nil {
		return nil, err
	}
	trashed := map[string]bool{}
	for _, s := range states {
		trashed[s.Item] = true
	}
	kept := items[:0]
	for _, it := range items {
		if !trashed[it.ID] {
			kept = append(kept, it)
		}
	}
	return kept, nil
}

func writeItems(cmd *cobra.Command, o output.Options, items []item, long bool) error {
	if long {
		rows := make([][]string, len(items))
		for i, it := range items {
			rows[i] = []string{
				it.Name, kind(it), sizeCell(it), it.Updated, it.ID,
			}
		}
		return o.Write(cmd.OutOrStdout(), []string{"NAME", "KIND", "SIZE", "UPDATED", "ID"}, rows, items)
	}
	rows := make([][]string, len(items))
	for i, it := range items {
		rows[i] = []string{it.Name}
	}
	return o.Write(cmd.OutOrStdout(), nil, rows, items)
}

func kind(it item) string {
	if it.IsFolder {
		return "folder"
	}
	if it.MimeType != "" {
		return it.MimeType
	}
	return "file"
}

func sizeCell(it item) string {
	if it.IsFolder {
		return "-"
	}
	return output.FormatBytes(it.Size)
}
