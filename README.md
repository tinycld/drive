# @tinycld/drive

Cloud file storage for your organization — folders, versioning, sharing, public links, thumbnails, previews, trash, and a native WebDAV endpoint so you can mount your drive as a network folder from any OS.

Part of [TinyCld](https://tinycld.org/) — the open-source, self-hosted Google Workspace alternative.

## Features

- **Folders & files.** Nested hierarchy, org-scoped. Create, rename, move, copy, trash.
- **Versioning.** Every upload creates a new `drive_item_versions` row with size, mime type, source (`upload` | `system`), and an optional label. Restore or download any prior version.
- **Role-based sharing.** Per-item shares with `owner` / `editor` / `viewer` roles. "Shared with me" view lists everything others have given you access to.
- **Public share links.** Tokenized URLs with viewer or editor role, optional expiry, download counters, last-accessed timestamps, and an on/off toggle. Served by a public route so recipients don't need a TinyCld account.
- **Thumbnails & previews.** Server-side thumbnail generation. In-app previews for PDFs (canvas renderer), images, video, audio, and text/code.
- **Smart categories.** Files are auto-categorized (`document`, `spreadsheet`, `pdf`, `image`, `presentation`, `drawing`, `video`, `audio`, `archive`, `code`) for icons and filtering.
- **Starred / Recent / Trash.** Per-user state: favorites, last-viewed, and soft-delete with restore.
- **Storage limits.** Per-org quota enforcement (`storage_limits.go`).
- **Drag-and-drop uploads.** Multi-file DropZone with a persistent upload status bar.
- **Search.** Native search endpoint across item names and descriptions.
- **WebDAV mount.** Native `/drive/` endpoint. Mount from macOS Finder, Windows Explorer, or Linux Nautilus — your drive becomes a network folder, with one folder per org you belong to at the root.
- **Real-time updates.** Uploads, renames, and share changes from any client appear instantly across every other session.

## Protocol

| Protocol | RFC       | Port | Purpose                                        |
|----------|-----------|------|------------------------------------------------|
| WebDAV   | RFC 4918  | 443  | Mount drive as a network folder from any OS    |

## Relationship to the app shell

`@tinycld/drive` is a feature package for the [TinyCld app shell](https://github.com/tinycld/tinycld), which bundles `@tinycld/core` (auth, routing, storage, UI primitives). The app shell ships with **no** feature packages; install this one to add a Drive app.

This package contributes:

- **Screens** — org-scoped routes at `/a/<org>/drive` (index, folder view, path-based navigation).
- **Public screens** — top-level public routes for share-link recipients (no auth required).
- **Provider** — a wrapping context that loads folder tree and upload state.
- **Nav entry** — sidebar icon with keyboard shortcut `t d` / `d`.
- **Collections** — `drive_items`, `drive_shares`, `drive_item_state`, `drive_item_versions`, `drive_share_links`.
- **Migrations** — schema and indexes under `pb-migrations/`.
- **Go server module** — WebDAV endpoint, public-share endpoints, download/upload handlers, thumbnail generation, version management, archive extraction, permissions, storage quotas, and search — all wired into the app shell's PocketBase binary.

The package depends on `@tinycld/core` at runtime (React, pbtsdb, `~/lib/*`). The app shell has no knowledge of this package at compile time — everything is discovered at generator time by scanning `tinycld/packages/`.

## Installation

From inside your app shell checkout (`tinycld/tinycld`):

```sh
bun run packages:install <this-repo-git-url>
```

That clones the repo next to the app shell, symlinks it into `tinycld/packages/@tinycld/drive`, and runs the generator to wire up routes, collections, migrations, public routes, and Go server extensions.

To remove:

```sh
bun run packages:unlink @tinycld/drive
```

## Development

This package is not run standalone — it only makes sense inside an app shell checkout.

```sh
cd ../tinycld
bun run dev              # expo + pocketbase (with WebDAV) with drive linked
bun run test:unit        # includes this package's tests
bun run checks           # biome + tsc across the app shell + linked packages
```

**Do not** run `bun install` inside this directory. Peer dependencies resolve through the app shell's `node_modules/`; installing here creates duplicate copies of `react`, `react-native`, etc. and breaks TypeScript.

## License

See the root TinyCld repository for licensing.
