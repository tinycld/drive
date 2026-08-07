package cli

import (
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
	"tinycld.org/packages/drive/api"
)

func newLinkCmd(c *client.Client) *cobra.Command {
	link := &cobra.Command{
		Use:   "link",
		Short: "Manage public share links",
	}
	link.AddCommand(newLinkCreateCmd(c), newLinkListCmd(c), newLinkRevokeCmd(c))
	return link
}

func newLinkCreateCmd(c *client.Client) *cobra.Command {
	var role, expires string
	cmd := &cobra.Command{
		Use:   "create <path>",
		Short: "Create a public link to an item",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			switch role {
			case "viewer", "commentor", "editor":
			default:
				return fmt.Errorf("--role must be viewer, commentor, or editor")
			}
			// The server passes expires_at straight to a date field and 500s on
			// a malformed value, so validate the timestamp here.
			if expires != "" {
				if _, err := time.Parse(time.RFC3339, expires); err != nil {
					return fmt.Errorf("--expires must be RFC 3339 (e.g. 2026-12-31T23:59:59Z): %w", err)
				}
			}
			ctx := cmd.Context()
			it, err := resolvePath(ctx, c, args[0])
			if err != nil {
				return err
			}
			var resp api.ShareLinkResponse
			err = c.PostJSON(ctx, "/api/drive/share-link", api.CreateShareLinkRequest{
				ItemID: it.ID, Role: role, ExpiresAt: expires,
			}, &resp)
			if err != nil {
				return err
			}
			o.Info(cmd.ErrOrStderr(), "created a %s link to %s", role, it.Name)
			if o.Format != output.Table {
				return o.Write(cmd.OutOrStdout(), nil, nil, resp)
			}
			fmt.Fprintln(cmd.OutOrStdout(), resp.URL)
			return nil
		},
	}
	cmd.Flags().StringVar(&role, "role", "viewer", "access level: viewer, commentor, or editor")
	cmd.Flags().StringVar(&expires, "expires", "", "expiry timestamp (RFC 3339); omit for no expiry")
	return cmd
}

func newLinkListCmd(c *client.Client) *cobra.Command {
	return &cobra.Command{
		Use:   "list <path>",
		Short: "List an item's public links, including revoked ones",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			ctx := cmd.Context()
			it, err := resolvePath(ctx, c, args[0])
			if err != nil {
				return err
			}
			var resp api.ShareLinkListResponse
			q := url.Values{"item_id": {it.ID}}
			if err := c.GetJSON(ctx, "/api/drive/share-links?"+q.Encode(), &resp); err != nil {
				return err
			}
			rows := make([][]string, len(resp.Links))
			for i, l := range resp.Links {
				rows[i] = []string{
					l.ID, l.Role, activeCell(l.IsActive), orDash(l.ExpiresAt),
					strconv.Itoa(l.DownloadCount), l.URL,
				}
			}
			return o.Write(cmd.OutOrStdout(),
				[]string{"ID", "ROLE", "ACTIVE", "EXPIRES", "DOWNLOADS", "URL"}, rows, resp)
		},
	}
}

func newLinkRevokeCmd(c *client.Client) *cobra.Command {
	return &cobra.Command{
		Use:   "revoke <link-id>",
		Short: "Revoke a public link (ids come from `drive link list`)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			// Not a collection record delete: the endpoint soft-revokes by
			// clearing is_active so the audit trail (download counts) survives.
			if err := c.Delete(cmd.Context(), "/api/drive/share-link/"+url.PathEscape(args[0])); err != nil {
				return err
			}
			o.Info(cmd.ErrOrStderr(), "revoked %s", args[0])
			return nil
		},
	}
}

func activeCell(active bool) string {
	if active {
		return "yes"
	}
	return "revoked"
}

func orDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}
