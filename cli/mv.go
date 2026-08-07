package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

func newMvCmd(c *client.Client) *cobra.Command {
	return &cobra.Command{
		Use:   "mv <src> <dst>",
		Short: "Move or rename",
		Long: "Move src into dst when dst is an existing folder; otherwise " +
			"reparent and rename to dst's final segment.",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			ctx := cmd.Context()
			src, err := resolvePath(ctx, c, args[0])
			if err != nil {
				return err
			}

			patch := map[string]any{}
			if dst, err := resolvePath(ctx, c, args[1]); err == nil && dst.IsFolder {
				patch["parent"] = dst.ID
			} else {
				parent, name, err := resolveParentAndName(ctx, c, args[1])
				if err != nil {
					return err
				}
				patch["parent"] = parent.ID
				patch["name"] = name
			}

			// The server's update hook rejects a move that would create a
			// parent cycle; its 400 surfaces here as the command error.
			moved, err := client.UpdateRecord[item](ctx, c, "drive_items", src.ID, patch)
			if err != nil {
				return err
			}
			o.Info(cmd.ErrOrStderr(), "moved %s -> %s", args[0], args[1])
			if o.Format != output.Table {
				return o.Write(cmd.OutOrStdout(), nil, nil, moved)
			}
			return nil
		},
	}
}
