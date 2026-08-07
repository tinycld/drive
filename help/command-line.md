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

## Moving files in and out

```
tinycld drive put report.pdf /Projects        # upload into a folder
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

`rm` moves items to your personal trash — restorable from the Trash screen in
the app. `--permanent` asks for confirmation first; pass `--yes` in scripts.

## Scripting

Every command accepts `--json` for stable, machine-readable output:

```
tinycld drive ls /Projects --json | jq '.[].name'
```

Sharing, public links, and version history are managed in the app for now —
see [Sharing](help://drive:sharing) and [Versions](help://drive:versions).
