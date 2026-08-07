package cli

import (
	"fmt"
	"io"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
)

func newCatCmd(c *client.Client) *cobra.Command {
	return &cobra.Command{
		Use:   "cat <path>",
		Short: "Print file contents to stdout",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			it, err := resolvePath(cmd.Context(), c, args[0])
			if err != nil {
				return err
			}
			if it.IsFolder {
				return fmt.Errorf("%s: is a folder", args[0])
			}
			if it.File == "" {
				return fmt.Errorf("%s: has no stored content", args[0])
			}
			body, _, err := c.Get(cmd.Context(), client.FileURL("drive_items", it.ID, it.File))
			if err != nil {
				return err
			}
			defer body.Close()
			_, err = io.Copy(cmd.OutOrStdout(), body)
			return err
		},
	}
}
