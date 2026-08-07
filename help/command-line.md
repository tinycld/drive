---
title: Drive from the command line
summary: List, upload, download, and organize your files from a terminal with the tinycld CLI.
tags: [cli, terminal, automation, upload, download]
order: 130
---

The `tinycld` command line tool includes a `drive` command group when the
Drive package is installed. To download the tool and log in, see
[Command line tool](help://core:command-line). Everything below assumes you
are logged in.

Paths work like shell paths: `/` is the top of your Drive, and
`/Projects/Roadmap.md` names a file inside the Projects folder. Anywhere a
path is accepted you can also pass `id:<record id>` (ids are shown by
`ls --long`).

## Browsing

```
tinycld drive ls /              # top-level folders and files
tinycld drive ls /Projects -l   # sizes, types, and ids
tinycld drive search "roadmap"  # full-text search, including file contents
```

`ls` hides items in your trash; add `--all` to include them.

`tree` prints a folder as an indented outline, three levels deep by default:

```
tinycld drive tree /Projects --depth 2
```

## Moving files in and out

```
tinycld drive put report.pdf /Projects        # upload into a folder
tinycld drive put ./photos /Albums -r         # upload a whole directory tree
tinycld drive get /Projects/report.pdf .      # download to the current dir
tinycld drive cat /Projects/notes.txt         # print a file to the terminal
```

Uploads get the same treatment as in the app: duplicate names are
de-duplicated automatically, and the final name is reported. Downloading a
folder produces a zip of its contents.

## Organizing

```
tinycld drive mkdir /Archive/2026 --parents   # create folders, with parents
tinycld drive mv /report.pdf /Archive/2026/   # move (or rename)
tinycld drive cp /a.txt /Backup/a.txt         # copy a file
tinycld drive rm /old-draft.md                # move to your trash
tinycld drive rm /Scratch --permanent         # delete for real, with children
tinycld drive usage                           # storage used and your limit
```

`rm` moves items to your personal trash. `--permanent` asks for confirmation
first; pass `--yes` in scripts.

```
tinycld drive trash                           # what you have trashed
tinycld drive restore id:abc123               # put one item back
```

Trash is per item, not per branch: trashing a folder leaves its children
un-trashed, so a trashed child and its trashed parent show up as separate
rows. Restore each item you want back. See [Trash](help://drive:trash).

## Sharing

```
tinycld drive share /Projects/plan.docx --user ada@example.com --role editor
```

`share` grants access to people who already have an account here — pass
`--user` once per person, with `--role viewer` or `--role editor`. Inviting
someone without an account sends a public link instead, which the app does but
the CLI deliberately does not.

Public links are managed separately, and these accept `--role commentor` too:

```
tinycld drive link create /plan.docx --role commentor --expires 2026-12-31T23:59:59Z
tinycld drive link list /plan.docx
tinycld drive link revoke <link-id>
```

Revoking deactivates a link but keeps its download history. See
[Sharing](help://drive:sharing) and [Public links](help://drive:public-links).

## Versions and exports

```
tinycld drive versions /plan.docx                       # history, newest first
tinycld drive versions /plan.docx --snapshot --label "before rewrite"
tinycld drive versions /plan.docx --restore 3
tinycld drive export /plan.docx report.pdf              # convert to PDF
```

Restoring snapshots the current file first, so nothing is lost. `export`
converts documents, spreadsheets, presentations, and text formats to PDF; the
server refuses folders, files that are already PDFs, and types it cannot
convert. See [Versions](help://drive:versions).

## Scripting

Every command accepts `--json` for stable, machine-readable output:

```
tinycld drive ls /Projects --json | jq '.[].name'
tinycld drive tree /Projects --json | jq '.children[].name'
```
