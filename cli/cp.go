package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

func newCpCmd(c *client.Client) *cobra.Command {
	return &cobra.Command{
		Use:   "cp <src> <dst>",
		Short: "Copy a file",
		Long: "Copy a file server-record to a new location. Folders are not " +
			"copyable (the web app has the same limit); there is no server-side " +
			"copy, so the bytes round-trip through this machine.",
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
			if src.IsFolder {
				return fmt.Errorf("%s: folders cannot be copied", args[0])
			}
			if src.File == "" {
				return fmt.Errorf("%s: has no stored content", args[0])
			}
			parent, name, err := resolveUploadTarget(ctx, c, args[1], src.Name, false)
			if err != nil {
				return err
			}

			tmp, err := os.CreateTemp("", "tinycld-cp-*")
			if err != nil {
				return err
			}
			tmpPath := tmp.Name()
			tmp.Close()
			defer os.Remove(tmpPath)
			err = client.DownloadToFile(ctx, c,
				client.FileURL("drive_items", src.ID, src.File), tmpPath, nil)
			if err != nil {
				return err
			}
			info, err := os.Stat(tmpPath)
			if err != nil {
				return err
			}

			created, err := uploadFile(ctx, c, parent.ID, name, tmpPath, info.Size(), cmd, o)
			if err != nil {
				return err
			}
			o.Info(cmd.ErrOrStderr(), "copied %s -> %s", args[0], created.Name)
			if o.Format != output.Table {
				return o.Write(cmd.OutOrStdout(), nil, nil, created)
			}
			return nil
		},
	}
}
