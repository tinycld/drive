package cli

import (
	"context"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strconv"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/ui"

	"tinycld.org/cli/output"
)

func newPutCmd(c *client.Client) *cobra.Command {
	var parents bool
	cmd := &cobra.Command{
		Use:   "put <local> [dest]",
		Short: "Upload a file",
		Long: "Upload a local file. dest is a folder path (the local name is kept) " +
			"or a full destination path (renames the upload).",
		Args: cobra.RangeArgs(1, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			ctx := cmd.Context()
			local := args[0]
			info, err := os.Stat(local)
			if err != nil {
				return err
			}
			if info.IsDir() {
				return fmt.Errorf("%s: is a directory (recursive upload is not supported yet)", local)
			}

			dest := "/"
			if len(args) == 2 {
				dest = args[1]
			}
			parent, name, err := resolveUploadTarget(ctx, c, dest, filepath.Base(local), parents)
			if err != nil {
				return err
			}

			created, err := uploadFile(ctx, c, parent.ID, name, local, info.Size(), cmd, o)
			if err != nil {
				return err
			}
			// The server's create hook may have deduplicated the name — report
			// what it actually stored.
			o.Info(cmd.ErrOrStderr(), "uploaded %s (%s)", created.Name, output.FormatBytes(created.Size))
			if o.Format != output.Table {
				return o.Write(cmd.OutOrStdout(), nil, nil, created)
			}
			return nil
		},
	}
	cmd.Flags().BoolVarP(&parents, "parents", "p", false, "create missing destination folders")
	return cmd
}

// resolveUploadTarget interprets dest: an existing folder keeps localName; an
// existing file is an error; a missing leaf means "upload under this name"
// beneath dest's parent (created with --parents when missing).
func resolveUploadTarget(ctx context.Context, c *client.Client, dest, localName string, parents bool) (item, string, error) {
	if target, err := resolvePath(ctx, c, dest); err == nil {
		if !target.IsFolder {
			return item{}, "", fmt.Errorf("%s: already exists (uploads never overwrite; versions come from the app)", dest)
		}
		return target, localName, nil
	}
	segments := splitPath(dest)
	if len(segments) == 0 {
		return item{}, "", fmt.Errorf("%s: not found", dest)
	}
	parentSegs, name := segments[:len(segments)-1], segments[len(segments)-1]
	parent, err := resolveFolderChain(ctx, c, parentSegs, parents)
	if err != nil {
		return item{}, "", err
	}
	return parent, name, nil
}

// uploadFile POSTs the multipart create. The server hook owns name dedup,
// size recomputation, quota, and the owner drive_shares row — the client
// sends exactly the fields the web upload does and nothing else.
func uploadFile(ctx context.Context, c *client.Client, parentID, name, local string, size int64, cmd *cobra.Command, o output.Options) (item, error) {
	userID, err := c.UserID(ctx)
	if err != nil {
		return item{}, err
	}
	mimeType := mime.TypeByExtension(filepath.Ext(name))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	fields := map[string]string{
		"name":        name,
		"is_folder":   "false",
		"mime_type":   mimeType,
		"parent":      parentID,
		"created_by":  userID,
		"size":        strconv.FormatInt(size, 10),
		"description": "",
	}
	prog := ui.NewProgress(o, cmd.ErrOrStderr(), "uploading")
	defer prog.Done()
	return client.CreateRecordMultipart[item](ctx, c, "drive_items", fields,
		[]client.FilePart{{Field: "file", Name: name, Path: local}}, prog.Func())
}
