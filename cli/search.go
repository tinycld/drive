package cli

import (
	"net/url"
	"strconv"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
	"tinycld.org/packages/drive/api"
)

func newSearchCmd(c *client.Client) *cobra.Command {
	var limit, offset int
	cmd := &cobra.Command{
		Use:   "search <query>",
		Short: "Full-text search files by name, description, and content",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			q := url.Values{"q": {args[0]}}
			if limit > 0 {
				q.Set("limit", strconv.Itoa(limit))
			}
			if offset > 0 {
				q.Set("offset", strconv.Itoa(offset))
			}
			var resp api.SearchResponse
			if err := c.GetJSON(cmd.Context(), "/api/drive/search?"+q.Encode(), &resp); err != nil {
				return err
			}
			rows := make([][]string, len(resp.Items))
			for i, it := range resp.Items {
				rows[i] = []string{
					it.Name, searchKind(it), searchSize(it),
					output.StripMarks(it.Highlight), it.ID,
				}
			}
			if err := o.Write(cmd.OutOrStdout(),
				[]string{"NAME", "KIND", "SIZE", "MATCH", "ID"}, rows, resp); err != nil {
				return err
			}
			o.Info(cmd.ErrOrStderr(), "%d of %d result(s)", len(resp.Items), resp.Total)
			return nil
		},
	}
	cmd.Flags().IntVar(&limit, "limit", 0, "maximum results (server caps at 100)")
	cmd.Flags().IntVar(&offset, "offset", 0, "skip this many results")
	return cmd
}

func searchKind(it api.SearchResultItem) string {
	if it.IsFolder {
		return "folder"
	}
	if it.MimeType != "" {
		return it.MimeType
	}
	return "file"
}

func searchSize(it api.SearchResultItem) string {
	if it.IsFolder {
		return "-"
	}
	return output.FormatBytes(it.Size)
}
