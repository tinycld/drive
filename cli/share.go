package cli

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
	"tinycld.org/packages/drive/api"
)

// userRow is the subset of the users collection needed to turn an email
// address into the relation id a share row requires.
type userRow struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func newShareCmd(c *client.Client) *cobra.Command {
	var users []string
	var role, message string
	cmd := &cobra.Command{
		Use:   "share <path>",
		Short: "Share an item with people on this server",
		Long: "Grants access to existing users, by email. Only the item's creator " +
			"can share it. Sharing with someone who has no account here is not " +
			"supported from the CLI — use the app, which sends a public link " +
			"invitation instead.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			if len(users) == 0 {
				return fmt.Errorf("at least one --user is required")
			}
			// This endpoint accepts only these two; commentor is silently
			// downgraded server-side, so reject it here instead of surprising
			// the caller. Share LINKS do support commentor.
			if role != "editor" && role != "viewer" {
				return fmt.Errorf(
					"--role must be editor or viewer (use `drive link create --role commentor` for comment-only links)")
			}
			ctx := cmd.Context()
			it, err := resolvePath(ctx, c, args[0])
			if err != nil {
				return err
			}

			recipients := make([]api.ShareRecipient, 0, len(users))
			for _, email := range users {
				u, err := findUserByEmail(ctx, c, email)
				if err != nil {
					return err
				}
				recipients = append(recipients, api.ShareRecipient{
					UserID: u.ID, Email: u.Email, Name: u.Name, Role: role,
				})
			}

			var resp api.ShareResponse
			err = c.PostJSON(ctx, "/api/drive/share", api.ShareRequest{
				ItemID: it.ID, Recipients: recipients, Message: message,
			}, &resp)
			if err != nil {
				return err
			}
			o.Info(cmd.ErrOrStderr(), "shared %s with %d person(s); %d new grant(s)",
				it.Name, len(recipients), resp.SharesCreated)
			if o.Format != output.Table {
				return o.Write(cmd.OutOrStdout(), nil, nil, resp)
			}
			return nil
		},
	}
	cmd.Flags().StringArrayVar(&users, "user", nil, "email address of a person to share with; repeatable")
	cmd.Flags().StringVar(&role, "role", "viewer", "access level: viewer or editor")
	cmd.Flags().StringVar(&message, "message", "", "note to include in the invitation email")
	return cmd
}

// findUserByEmail resolves an address to a user record. The share endpoint
// creates a grant ONLY when user_id is set — an email-only recipient silently
// becomes an emailed public link instead, so refusing here keeps the command's
// promise honest.
func findUserByEmail(ctx context.Context, c *client.Client, email string) (userRow, error) {
	res, err := client.ListRecords[userRow](ctx, c, "users", client.ListOptions{
		Filter:    client.Filter("email = {:e}", map[string]any{"e": strings.TrimSpace(email)}),
		PerPage:   1,
		SkipTotal: true,
	})
	if err != nil {
		return userRow{}, err
	}
	if len(res.Items) == 0 {
		return userRow{}, fmt.Errorf(
			"%s: no account on this server — invite them from the app to send a link instead", email)
	}
	return res.Items[0], nil
}
