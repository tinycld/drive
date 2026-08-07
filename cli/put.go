package cli

import (
	"context"
	"fmt"
	"io/fs"
	"mime"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
	"tinycld.org/cli/ui"
)

func newPutCmd(c *client.Client) *cobra.Command {
	var parents, recursive bool
	cmd := &cobra.Command{
		Use:   "put <local> [dest]",
		Short: "Upload a file, or a directory tree with --recursive",
		Long: "Upload a local file. dest is a folder path (the local name is kept) " +
			"or a full destination path (renames the upload). With --recursive, " +
			"local may be a directory: its tree is recreated under dest.",
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
			dest := "/"
			if len(args) == 2 {
				dest = args[1]
			}

			if info.IsDir() {
				if !recursive {
					return fmt.Errorf("%s: is a directory (pass --recursive to upload its contents)", local)
				}
				return putTree(ctx, c, local, dest, cmd, o)
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
	cmd.Flags().BoolVarP(&recursive, "recursive", "r", false, "upload a directory tree")
	return cmd
}

// putTree walks a local directory and mirrors it under dest, creating the
// destination chain (and each subdirectory) as it goes. Name collisions need no
// policy: the server's create hook de-duplicates, exactly as for a single
// upload.
func putTree(ctx context.Context, c *client.Client, localRoot, dest string, cmd *cobra.Command, o output.Options) error {
	base := filepath.Base(strings.TrimRight(localRoot, string(filepath.Separator)))
	rootFolder, err := resolveFolderChain(ctx, c, append(splitPath(dest), base), true)
	if err != nil {
		return err
	}
	// Local relative dir -> remote folder, seeded with the tree root.
	folders := map[string]item{".": rootFolder}
	files := 0

	err = filepath.WalkDir(localRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(localRoot, path)
		if err != nil {
			return err
		}
		if d.IsDir() {
			if rel == "." {
				return nil
			}
			parent, ok := folders[filepath.Dir(rel)]
			if !ok {
				return fmt.Errorf("no remote folder for %s", filepath.Dir(rel))
			}
			created, err := createFolder(ctx, c, parent.ID, d.Name())
			if err != nil {
				return err
			}
			folders[rel] = created
			return nil
		}
		if !d.Type().IsRegular() {
			o.Info(cmd.ErrOrStderr(), "skipping %s (not a regular file)", rel)
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		parent, ok := folders[filepath.Dir(rel)]
		if !ok {
			return fmt.Errorf("no remote folder for %s", filepath.Dir(rel))
		}
		if _, err := uploadFile(ctx, c, parent.ID, d.Name(), path, info.Size(), cmd, o); err != nil {
			return fmt.Errorf("%s: %w", rel, err)
		}
		files++
		return nil
	})
	if err != nil {
		return err
	}
	o.Info(cmd.ErrOrStderr(), "uploaded %d file(s) into %s", files, base)
	return nil
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
