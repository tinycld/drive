// Package cli contributes the `tinycld drive` command group. Commands are
// pure HTTP clients: PocketBase record REST for row reads/writes (the server's
// create/update hooks own dedup, quota, owner shares, and cycle rejection) and
// the typed endpoints declared in tinycld.org/packages/drive/api.
package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
)

func Register(root *cobra.Command, c *client.Client) {
	drive := &cobra.Command{
		Use:   "drive",
		Short: "Files: list, transfer, and manage Drive",
	}
	drive.AddCommand(
		newLsCmd(c),
		newTreeCmd(c),
		newSearchCmd(c),
		newCatCmd(c),
		newGetCmd(c),
		newPutCmd(c),
		newMkdirCmd(c),
		newMvCmd(c),
		newCpCmd(c),
		newRmCmd(c),
		newTrashCmd(c),
		newRestoreCmd(c),
		newShareCmd(c),
		newLinkCmd(c),
		newVersionsCmd(c),
		newExportCmd(c),
		newUsageCmd(c),
	)
	root.AddCommand(drive)
}
