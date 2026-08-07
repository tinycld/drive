package cli

import (
	"context"
	"fmt"
	"strconv"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
	"tinycld.org/packages/drive/api"
)

// version is the drive_item_versions row shape the CLI reads.
type version struct {
	ID            string `json:"id"`
	Item          string `json:"item"`
	VersionNumber int    `json:"version_number"`
	File          string `json:"file"`
	Size          int64  `json:"size"`
	MimeType      string `json:"mime_type"`
	Source        string `json:"source"`
	Label         string `json:"label"`
	Created       string `json:"created"`
}

func newVersionsCmd(c *client.Client) *cobra.Command {
	var restore int
	var snapshot bool
	var label string
	cmd := &cobra.Command{
		Use:   "versions <path>",
		Short: "List version history, restore a version, or snapshot the current file",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			if restore > 0 && snapshot {
				return fmt.Errorf("--restore and --snapshot are mutually exclusive")
			}
			if label != "" && !snapshot {
				return fmt.Errorf("--label applies to --snapshot")
			}
			ctx := cmd.Context()
			it, err := resolvePath(ctx, c, args[0])
			if err != nil {
				return err
			}
			if it.IsFolder {
				return fmt.Errorf("%s: folders have no versions", args[0])
			}

			switch {
			case snapshot:
				var resp api.SnapshotVersionResponse
				err = c.PostJSON(ctx, "/api/drive/versions/snapshot",
					api.SnapshotVersionRequest{Item: it.ID, Label: label}, &resp)
				if err != nil {
					return err
				}
				// The response carries only the item id, so re-list to name the
				// version that was just written.
				vs, err := listVersions(ctx, c, it.ID)
				if err != nil {
					return err
				}
				if len(vs) > 0 {
					o.Info(cmd.ErrOrStderr(), "snapshotted %s as version %d", it.Name, vs[0].VersionNumber)
				}
				return nil

			case restore > 0:
				vs, err := listVersions(ctx, c, it.ID)
				if err != nil {
					return err
				}
				target, ok := versionByNumber(vs, restore)
				if !ok {
					return fmt.Errorf("%s: no version %d (see `drive versions %s`)", it.Name, restore, args[0])
				}
				var resp api.VersionFileResponse
				err = c.PostJSON(ctx, "/api/drive/versions/restore",
					api.RestoreVersionRequest{Item: it.ID, Version: target.ID}, &resp)
				if err != nil {
					return err
				}
				o.Info(cmd.ErrOrStderr(), "restored %s to version %d (%s)",
					resp.Name, restore, output.FormatBytes(resp.Size))
				if o.Format != output.Table {
					return o.Write(cmd.OutOrStdout(), nil, nil, resp)
				}
				return nil
			}

			vs, err := listVersions(ctx, c, it.ID)
			if err != nil {
				return err
			}
			rows := make([][]string, len(vs))
			for i, v := range vs {
				rows[i] = []string{
					strconv.Itoa(v.VersionNumber), orDash(v.Label), output.FormatBytes(v.Size),
					v.Source, v.Created,
				}
			}
			return o.Write(cmd.OutOrStdout(),
				[]string{"N", "LABEL", "SIZE", "SOURCE", "CREATED"}, rows, vs)
		},
	}
	cmd.Flags().IntVar(&restore, "restore", 0, "restore this version number")
	cmd.Flags().BoolVar(&snapshot, "snapshot", false, "snapshot the current file as a new version")
	cmd.Flags().StringVar(&label, "label", "", "label for --snapshot")
	return cmd
}

// listVersions returns the item's versions newest-first, hiding the `system`
// entries the server writes just before a restore (the app hides them too).
//
// The filter is written with a literal `!=` rather than through a query
// builder: PocketBase's parser rejects the `!(...)` form a negation helper
// would produce.
func listVersions(ctx context.Context, c *client.Client, itemID string) ([]version, error) {
	return client.ListAll[version](ctx, c, "drive_item_versions",
		client.Filter(`item = {:i} && source != "system"`, map[string]any{"i": itemID}),
		"-version_number")
}

func versionByNumber(vs []version, n int) (version, bool) {
	for _, v := range vs {
		if v.VersionNumber == n {
			return v, true
		}
	}
	return version{}, false
}
