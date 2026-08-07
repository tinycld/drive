package cli

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

func newMkdirCmd(c *client.Client) *cobra.Command {
	var parents bool
	cmd := &cobra.Command{
		Use:   "mkdir <path>",
		Short: "Create a folder",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			ctx := cmd.Context()
			segments := splitPath(args[0])
			if len(segments) == 0 {
				return fmt.Errorf("%s: not a creatable path", args[0])
			}
			if _, err := resolvePath(ctx, c, args[0]); err == nil {
				return fmt.Errorf("%s: already exists", args[0])
			}
			if !parents {
				// Only the leaf may be missing.
				if _, err := resolvePath(ctx, c, "/"+strings.Join(segments[:len(segments)-1], "/")); err != nil {
					return fmt.Errorf("%w (use --parents to create intermediate folders)", err)
				}
			}
			folder, err := resolveFolderChain(ctx, c, segments, true)
			if err != nil {
				return err
			}
			o.Info(cmd.ErrOrStderr(), "created %s", args[0])
			if o.Format != output.Table {
				return o.Write(cmd.OutOrStdout(), nil, nil, folder)
			}
			return nil
		},
	}
	cmd.Flags().BoolVarP(&parents, "parents", "p", false, "create missing intermediate folders")
	return cmd
}

// resolveFolderChain walks segments from the root, creating missing folders
// when create is true. Every hop must be a folder.
func resolveFolderChain(ctx context.Context, c *client.Client, segments []string, create bool) (item, error) {
	cur := root
	for i, seg := range segments {
		next, found, err := childByName(ctx, c, cur.ID, seg)
		if err != nil {
			return item{}, err
		}
		if found {
			if !next.IsFolder {
				return item{}, fmt.Errorf("/%s: not a folder", strings.Join(segments[:i+1], "/"))
			}
			cur = next
			continue
		}
		if !create {
			return item{}, fmt.Errorf("/%s: %w", strings.Join(segments[:i+1], "/"), errNotFound)
		}
		cur, err = createFolder(ctx, c, cur.ID, seg)
		if err != nil {
			return item{}, err
		}
	}
	return cur, nil
}

// createFolder mirrors the web client's folder insert field-for-field
// (useDriveMutations createFolderMutation); the server hook adds the owner
// share row.
func createFolder(ctx context.Context, c *client.Client, parentID, name string) (item, error) {
	userID, err := c.UserID(ctx)
	if err != nil {
		return item{}, err
	}
	return client.CreateRecord[item](ctx, c, "drive_items", map[string]any{
		"name":        name,
		"is_folder":   true,
		"mime_type":   "",
		"parent":      parentID,
		"created_by":  userID,
		"size":        0,
		"description": "",
	})
}
