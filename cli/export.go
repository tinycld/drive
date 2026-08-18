package cli

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
	"tinycld.org/cli/ui"
	"tinycld.org/packages/drive/api"
)

func newExportCmd(c *client.Client) *cobra.Command {
	var to string
	cmd := &cobra.Command{
		Use:   "export <path> [dest]",
		Short: "Export a document to PDF",
		Long: "Converts a document (docx, xlsx, pptx, csv, markdown, html, rtf, " +
			"epub, plain text) to PDF. The server rejects folders, files that are " +
			"already PDFs, and types it cannot convert.",
		Args: cobra.RangeArgs(1, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, yes, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			if to != "pdf" {
				return fmt.Errorf("--to currently supports only pdf")
			}
			ctx := cmd.Context()
			it, err := resolvePath(ctx, c, args[0])
			if err != nil {
				return err
			}

			var tok api.TokenResponse
			err = c.PostJSON(ctx, "/api/drive/export-token",
				api.ExportTokenRequest{Item: it.ID, To: to}, &tok)
			if err != nil {
				return err
			}
			dest := destFor(args, pdfName(it.Name))
			if err := ui.ConfirmOverwrite(o, yes, cmd.InOrStdin(), cmd.OutOrStdout(), dest); err != nil {
				return err
			}
			prog := ui.NewProgress(o, cmd.ErrOrStderr(), "exporting")
			defer prog.Done()
			// The token in the URL IS the credential (single use, 60s) — the
			// endpoint takes no bearer, same as folder download.
			if err := client.DownloadPublic(ctx, nil, c.Origin()+tok.URL, dest, prog.Func()); err != nil {
				return err
			}
			o.Info(cmd.ErrOrStderr(), "saved %s", dest)
			return nil
		},
	}
	cmd.Flags().StringVar(&to, "to", "pdf", "export format")
	return cmd
}

// pdfName swaps one trailing extension for .pdf, matching the filename the
// server sets in Content-Disposition.
func pdfName(name string) string {
	return strings.TrimSuffix(name, filepath.Ext(name)) + ".pdf"
}
