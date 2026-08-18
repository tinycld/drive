package cli

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
	"tinycld.org/cli/ui"
	"tinycld.org/packages/drive/api"
)

func newGetCmd(c *client.Client) *cobra.Command {
	return &cobra.Command{
		Use:   "get <path> [dest]",
		Short: "Download a file, or a folder as a zip",
		Args:  cobra.RangeArgs(1, 2),
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

			if it.IsFolder {
				// Folder download is the two-step token flow: mint a
				// single-use token, then fetch the zip WITHOUT the bearer —
				// the token in the URL is the whole credential.
				var tok api.TokenResponse
				err := c.PostJSON(ctx, "/api/drive/download-token",
					api.DownloadTokenRequest{Item: it.ID}, &tok)
				if err != nil {
					return err
				}
				dest := destFor(args, it.Name+".zip")
				if err := ui.ConfirmOverwrite(o, yes, cmd.InOrStdin(), cmd.OutOrStdout(), dest); err != nil {
					return err
				}
				prog := ui.NewProgress(o, cmd.ErrOrStderr(), "downloading")
				defer prog.Done()
				if err := client.DownloadPublic(ctx, nil, c.Origin()+tok.URL, dest, prog.Func()); err != nil {
					return err
				}
				o.Info(cmd.ErrOrStderr(), "saved %s", dest)
				return nil
			}

			if it.File == "" {
				return fmt.Errorf("%s: has no stored content", args[0])
			}
			dest := destFor(args, it.Name)
			if err := ui.ConfirmOverwrite(o, yes, cmd.InOrStdin(), cmd.OutOrStdout(), dest); err != nil {
				return err
			}
			prog := ui.NewProgress(o, cmd.ErrOrStderr(), "downloading")
			defer prog.Done()
			err = client.DownloadToFile(ctx, c,
				client.FileURL("drive_items", it.ID, it.File), dest, prog.Func())
			if err != nil {
				return err
			}
			o.Info(cmd.ErrOrStderr(), "saved %s", dest)
			return nil
		},
	}
}

// destFor picks the local destination: the optional second argument (a
// directory keeps the remote name), else the remote name in the cwd.
//
// The remote name is server-side data and never a path, so it is reduced to a
// bare filename first: without that, an item named "../../.ssh/authorized_keys"
// writes wherever it likes, including outside the directory the user chose. The
// user's own dest argument is left verbatim — choosing where their file lands is
// the point of the argument.
func destFor(args []string, name string) string {
	name = client.LocalFileName(name)
	if len(args) < 2 {
		return name
	}
	dest := args[1]
	if info, err := os.Stat(dest); err == nil && info.IsDir() {
		return filepath.Join(dest, name)
	}
	return dest
}
