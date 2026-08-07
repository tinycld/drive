package cli

import (
	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
	"tinycld.org/packages/drive/api"
)

func newUsageCmd(c *client.Client) *cobra.Command {
	return &cobra.Command{
		Use:   "usage",
		Short: "Show storage usage",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			var resp api.StorageUsageResponse
			if err := c.GetJSON(cmd.Context(), "/api/drive/storage-usage", &resp); err != nil {
				return err
			}
			limit := "unlimited"
			if resp.HasLimit {
				limit = output.FormatBytes(resp.LimitBytes)
			}
			rows := [][]string{
				{"Your files", output.FormatBytes(resp.UserUsedBytes)},
				{"All Drive files", output.FormatBytes(resp.OrgDriveBytes)},
				{"Mail storage", output.FormatBytes(resp.OrgMailBytes)},
				{"Storage limit", limit},
			}
			return o.Write(cmd.OutOrStdout(), []string{"WHAT", "SIZE"}, rows, resp)
		},
	}
}
