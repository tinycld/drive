package cli

import (
	"context"
	"fmt"
	"io"

	"github.com/spf13/cobra"

	"tinycld.org/cli/client"
	"tinycld.org/cli/output"
)

// treeNode is one node of the rendered tree. Children is nil for files and for
// folders cut off by --depth.
type treeNode struct {
	item
	Children []treeNode `json:"children,omitempty"`
}

func newTreeCmd(c *client.Client) *cobra.Command {
	var depth int
	var all bool
	cmd := &cobra.Command{
		Use:   "tree [path]",
		Short: "Print a folder as a tree",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			o, _, err := output.FromCommand(cmd)
			if err != nil {
				return err
			}
			if depth < 1 {
				return fmt.Errorf("--depth must be at least 1")
			}
			ctx := cmd.Context()
			path := "/"
			if len(args) == 1 {
				path = args[0]
			}
			target, err := resolvePath(ctx, c, path)
			if err != nil {
				return err
			}
			if !target.IsFolder {
				return fmt.Errorf("%s: not a folder", path)
			}

			// One trash lookup for the whole walk — withoutTrashed refetches
			// per call, which would be a request per folder.
			trashed := map[string]bool{}
			if !all {
				trashed, err = trashedItemIDs(ctx, c)
				if err != nil {
					return err
				}
			}
			children, err := walkTree(ctx, c, target.ID, depth, trashed)
			if err != nil {
				return err
			}

			if o.Format == output.JSON {
				return o.Write(cmd.OutOrStdout(), nil, nil,
					treeNode{item: target, Children: children})
			}
			w := cmd.OutOrStdout()
			fmt.Fprintln(w, displayPath(path, target))
			printTree(w, children, "")
			return nil
		},
	}
	cmd.Flags().IntVar(&depth, "depth", 3, "how many levels to descend")
	cmd.Flags().BoolVarP(&all, "all", "a", false, "include trashed items")
	return cmd
}

func walkTree(ctx context.Context, c *client.Client, parentID string, depth int, trashed map[string]bool) ([]treeNode, error) {
	if depth == 0 {
		return nil, nil
	}
	items, err := client.ListAll[item](ctx, c, "drive_items",
		client.Filter("parent = {:p}", map[string]any{"p": parentID}), "-is_folder,name")
	if err != nil {
		return nil, err
	}
	var nodes []treeNode
	for _, it := range items {
		if trashed[it.ID] {
			continue
		}
		node := treeNode{item: it}
		if it.IsFolder {
			node.Children, err = walkTree(ctx, c, it.ID, depth-1, trashed)
			if err != nil {
				return nil, err
			}
		}
		nodes = append(nodes, node)
	}
	return nodes, nil
}

func printTree(w io.Writer, nodes []treeNode, prefix string) {
	for i, n := range nodes {
		branch, indent := "├── ", "│   "
		if i == len(nodes)-1 {
			branch, indent = "└── ", "    "
		}
		name := n.Name
		if n.IsFolder {
			name += "/"
		}
		fmt.Fprintf(w, "%s%s%s\n", prefix, branch, name)
		printTree(w, n.Children, prefix+indent)
	}
}

func displayPath(path string, target item) string {
	if target.ID == root.ID {
		return "/"
	}
	return path
}
