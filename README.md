# drive

Cloud file storage, with WebDAV.

A feature package for the [tinycld](https://tinycld.org/) ecosystem. Lives as a standalone git repo alongside the [`tinycld`](https://tinycld.org/) app shell and other sibling feature packages (`contacts`, `mail`, `calendar`, `calc`, `text`, `google-takeout-import`). `@tinycld/core` is the shared runtime/UI library, nested inside the `tinycld` shell repo at `tinycld/core/` and imported as `@tinycld/core`.

## What it does

Stores files for a TinyCld deployment, with per-user folders, sharing, versioning, public links, server-rendered thumbnails, and a native WebDAV mount endpoint at `/dav/drive/` so any OS can mount the drive as a network folder.

User-facing features:

- **Folders and files** — nested hierarchy. Create, rename, move, copy, trash.
- **Versioning** — every replacement of a file's bytes creates a `drive_item_versions` row with `version_number` (monotonic per-item), size, mime type, source (`upload` | `user` | `system`), and an optional label. Other packages (calc, text) call `POST /api/drive/versions/snapshot` to tag the current bytes as a labeled checkpoint without re-uploading. Restore or download any prior version.
- **Role-based sharing** — per-item shares with `owner` / `editor` / `commentor` / `viewer` roles (a commentor reads and comments but never edits). "Shared with me" lists everything other people have given you access to.
- **Public share links** — 64-hex-character tokenized URLs at `/share/<token>` with viewer, commentor, or editor role, optional expiry, download counters, last-accessed timestamps, and an enable / disable toggle that reuses the same token. Served by a public route so recipients don't need an account.
- **Server-side thumbnails** — generated asynchronously on upload. PDFs, EPUBs, and OOXML Office documents render through the pure-Go `doctaculous` library (via `tinycld.org/core/thumbnails`); HEIC/HEIF photos through `goheif`. Plain image types use PocketBase's built-in `?thumb=` query parameter.
- **In-app previews** — the preview modal and its viewers (PDF canvas renderer, image / video / audio players, text and code viewers) live in `@tinycld/core/file-viewer/`. Drive consumes them and lets other packages register custom previewers (e.g. Calc registers itself for `.xlsx`, surfaced as the "Open in Calc" file action).
- **Smart categories** — files are classified into `document`, `spreadsheet`, `pdf`, `image`, `presentation`, `drawing`, `video`, `audio`, `archive`, or `code` (mapping lives in `@tinycld/core/file-viewer/file-icons.ts`).
- **Starred / Recent / Trash** — per-user state. Soft-delete with restore; trashed items still count toward the storage quota until permanently deleted.
- **Storage quotas** — a per-user ceiling from the core `settings` table at key `storage_limit_bytes` and a deployment-wide ceiling at `org_storage_limit_bytes` (0 = unlimited). Drive declares its storage-bearing collections (`drive_items` + `drive_item_versions`, both sized by `size` and owned by `created_by`) via `quota.RegisterSources`; `core/quota` binds the enforcement hooks, so no write path — REST, WebDAV, or the version endpoints — can route around the limit.
- **Drag-and-drop uploads** — web-only; walks `webkitGetAsEntry` trees so dropping a folder preserves its structure. A persistent upload status bar tracks pending / uploading / done / error per file.
- **Search** — SQLite FTS5 across file name, description, and extracted text content. Document text extraction (PDF, Office, plain text) runs asynchronously via `core/textextract` and updates the FTS row when finished.
- **WebDAV mount** — native `/dav/drive/` endpoint. Mount from macOS Finder, Windows Explorer, or Linux GNOME / KDE; the drive becomes a network folder with your Drive tree directly at the root. See the in-app help topic `drive:webdav` for per-OS connection steps.
- **Realtime updates** — uploads, renames, and share changes propagate immediately through PocketBase's collection-realtime subscriptions (consumed via `pbtsdb`'s `useLiveQuery`). No custom WebSocket layer.
- **Single-item download** — web-only. Individual files stream directly from PocketBase; folders are zipped on demand via a short-lived (60 s) per-folder download token, capped at 10,000 files and 5 GB per archive.
- **Notifications** — when a `drive_shares` row is created and the recipient isn't the creator (i.e. real share, not the bookkeeping owner self-share), the recipient receives a `drive_file_shared` notification through `core/notify`.
- **Audit logging** — every mutation on `drive_items`, `drive_item_state`, and `drive_shares` is recorded by `core/audit`. `drive_items` rows are labeled by their `name` field.

## Automation rules

Drive contributes triggers and an action to the workflow-rules engine, so users can build "when this happens, do that" rules without writing code. Definitions live in `tinycld/drive/automation.ts`, declared via `automation: { definitions: 'automation' }` in `manifest.ts` plus a `"./automation"` entry in the package's exports map; the Go-side trigger filters, owner resolvers, and action handlers live in `server/automation.go`.

**Triggers**

- **`drive:file-added`** — "A file is added". A `drive_items` create, with `ownerField` `created_by`. Exposed fields: `name`, `mime_type` (labelled "Type"), `size`, `is_folder`, `parent` (labelled "Folder").
- **`drive:mentioned-in-comment`** — "I'm mentioned in a comment". A `comment_mentions` create, with `ownerField` `mentioned_user`. This one is deliberately cross-cutting: `comment_mentions` is shared, so the trigger covers documents, spreadsheets, *and* files in a single rule — which is why text and calc contribute no mention trigger of their own.
- **`drive:file-shared`** — "A file is shared with me". A `drive_shares` create; the owner is auto-detected from the `user` (recipient) relation.
- **`drive:share-link-created`** — "A public link is created". A `drive_share_links` create, with `ownerField` `created_by`. Compliance-oriented, and most useful as an org rule — as a personal rule it means "when *I* create a link".

**Action**

- **`drive:move-to-folder`** — "Move to folder". `kind: 'record-op'`: an update targeting the trigger record that sets `parent` from a `parent` param. `drive/server/automation.go` registers a RelationAuthorizer for that param (required — the engine refuses a relation param with no authorizer, so a rule can't move a file into a folder its owner can't write), alongside `fileAddedOwnerResolver`.

The user-facing help topic is `help/rules.md`; see [Automation rules](https://tinycld.org/docs/automation-rules) for the end-user guide, and [package automation](https://tinycld.org/docs/anatomy/automation) for the package-author contract.

## Mounting via WebDAV

The WebDAV endpoint is at **`https://<your-instance>/dav/drive/`** (port 443, same domain as the web UI). Authentication is HTTP Basic using your TinyCld email (or username) and password.

At the WebDAV root, you'll see your Drive's folder tree directly — the root is a synthetic directory over your top-level items.

The handler is `golang.org/x/net/webdav` with `webdav.NewMemLS()`, which advertises DAV class 2 (LOCK / UNLOCK) so macOS Finder mounts read-write. There is also a `/.well-known/webdav` route that 301-redirects to `/dav/drive/` to help clients that auto-discover.

For step-by-step connection instructions on macOS Finder, Windows Explorer, and Linux file managers, see the **`drive:webdav`** help topic inside the app (`/help/drive/webdav`, or click any `<HelpIcon topic="drive:webdav" />`). They live there rather than in this README so they update in lockstep with what users actually see in the UI.

## Theory of operations

The short version: every file is a row in `drive_items` with a PocketBase-managed blob attached. Sharing, public links, version history, and per-user state are sibling collections that reference the item by id. A handful of Go hooks on the item collection reconcile the declared size, dedup names, create the owner-share row, and trigger asynchronous text extraction and thumbnail generation; storage ceilings are enforced by `core/quota`'s hooks over the collections drive declares. The WebDAV handler lives in core (`tinycld.org/core/webdav`) and is driven by a `webdav.Source` config drive contributes.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Client (React Native / web)                                         │
│                                                                      │
│   DriveToolbar / DriveSidebar / FolderTree / PreviewModal            │
│   ShareDialog / DetailPanel / DropZone / UploadStatusBar             │
│                       │                                              │
│                       ▼                                              │
│   useDriveState  useDriveMutations  useFileUpload                    │
│                       │                                              │
│                       ▼                                              │
│   pbtsdb useLiveQuery / useMutation (TanStack DB collections)        │
│                       │                                              │
│                       ▼                                              │
│   PocketBase REST + realtime subscriptions ──────┐                   │
└──────────────────────────────────────────────────┼───────────────────┘
                                                   │
┌──────────────────────────────────────────────────┼───────────────────┐
│  Server (Go, PocketBase + tinycld.org/core)      │                   │
│                                                  ▼                   │
│   Collections                                                        │
│     drive_items            ── item rows, with `file` blob            │
│     drive_item_versions    ── snapshots, monotonic version_number    │
│     drive_shares           ── per-user access; role enum         │
│     drive_share_links      ── public links; 64-hex token             │
│     drive_item_state       ── per-user starred / last-viewed         │
│     comment_mentions       ── @-mentions; shared with text/calc      │
│     fts_drive_items        ── SQLite FTS5 virtual table              │
│                                                                      │
│   Hooks (register.go)                                                │
│     OnRecordCreate(drive_items):  reconcile size → dedup name →      │
│                                   create owner drive_shares (txn)    │
│     OnRecordUpdate(drive_items):  reject moves that form a cycle     │
│     OnRecordAfterCreate(drive_items):  syncFTS, extractText (async), │
│                                        generateThumbnail (async)     │
│     OnRecordAfterUpdate(drive_items):  same                          │
│     OnRecordAfterDelete(drive_items):  remove FTS row                │
│     OnRecordAfterCreate(drive_shares): notify recipient              │
│     (storage ceilings: core/quota binds the enforcement hooks)       │
│                                                                      │
│   API endpoints (register.go)                                        │
│     GET    /api/drive/search                                         │
│     POST   /api/drive/share                                          │
│     POST   /api/drive/upload-version                                 │
│     POST   /api/drive/versions/restore                               │
│     POST   /api/drive/versions/snapshot                              │
│     POST   /api/drive/share-link                                     │
│     DELETE /api/drive/share-link/{id}                                │
│     GET    /api/drive/share-links                                    │
│     GET    /api/drive/share-link/{token}            ── public        │
│     GET    /api/drive/share-link/{token}/file       ── public        │
│     GET    /api/drive/share-link/{token}/thumbnail  ── public        │
│     POST   /api/drive/share-link/{token}/session     ── public       │
│     POST   /api/drive/share-link/{token}/otp-request ── public       │
│     POST   /api/drive/share-link/{token}/otp-verify  ── public       │
│     POST   /api/drive/download-token                                 │
│     GET    /api/drive/download-folder?token=...                      │
│     POST   /api/drive/export-token                                   │
│     GET    /api/drive/export?token=...                               │
│     GET    /api/drive/storage-usage                                  │
│                                                                      │
│   WebDAV (served by core/webdav from drive's Source)                 │
│     ANY    /dav/drive  /  /dav/drive/{path...}                       │
│     ANY    /.well-known/webdav → 301 /dav/drive/                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Item create: the three concerns the hook owns

`OnRecordCreate("drive_items")` runs three things in order before delegating to `e.Next()`, then a fourth after:

1. **Size reconciliation** — the client-supplied `size` is untrusted (a forged `size=0` would under-report usage and slip past the quota hooks), so `reconcileDriveItemSize` overwrites it with the true byte length of the staged blob. Fileless creates (folders, blank items) keep their declared size. Drive's hook is bound before `core/quota`'s, so the ceiling is checked against the corrected size — the quota enforcement itself lives in `core/quota`, driven by the sources drive registers (limits come from the `settings` keys `storage_limit_bytes` per user and `org_storage_limit_bytes` deployment-wide; 0 / unset means unlimited).
2. **Name dedup** — `chooseUniqueDriveItemName` probes the `(parent, name)` unique index and, on collision, appends `(1)`, `(2)`, … until it finds a free name. The probe is best-effort: the DB index is still the ultimate safety net, and a concurrent transaction committing a colliding name between probe and INSERT surfaces as a save error to the client, which is acceptable.
3. **Persist via `e.Next()`** — the actual INSERT.
4. **Owner share** — `createOwnerShare` inserts a `drive_shares` row with role `owner` in the same transaction. This is a load-bearing invariant: every `drive_item` has at least one `drive_shares` row, and the entire permission system (including the WebDAV adapter) assumes it. Self-shares like this are filtered out of recipient notifications because the recipient is the creator.

### Asynchronous post-create work

After a successful create or update, two goroutines fire-and-forget via `routine.FireAndForget`:

- **Text extraction** (`extract.go` → `core/textextract`) — pulls bytes from the attached file, runs the format-specific extractor (PDF / Office / EPUB / RTF / HTML via `doctaculous`, plain text passthrough, plus any package-registered handlers), and writes the result into `fts_drive_items.content` via `updateFTSContent`. Failures log a warning but don't fail the request — the file is searchable by name and description even if content extraction breaks.
- **Thumbnail generation** (`thumbnails.go` → `core/thumbnails`) — only fires for mimes the core thumbnail package can render (PDF / EPUB / OOXML Word / Excel / PowerPoint / HEIC / HEIF). Document rendering is pure Go via `doctaculous`, which is safe to run concurrently — there is no global render mutex; HEIC goes through `goheif` and writes a JPEG. The thumbnail is stored on `drive_items.thumbnail`.

Both effectively run as eventual consistency: clients see the item appear immediately, the FTS row catches up when extraction finishes (typically <1 s for small docs, longer for large PDFs), and the thumbnail materializes when generation finishes.

### Sharing model

`drive_shares` has columns `(item, user, role, created_by)` — both `user` and `created_by` are relations straight to `users`. Roles are exactly:

- **`owner`** — full control. Created automatically by the item-create hook.
- **`editor`** — write access (rename, move, upload new version).
- **`commentor`** — read and comment, never edit.
- **`viewer`** — read-only.

Owners are not assignable through the share dialog UI — the only way to become an owner is to create the item. The Go-side read/write/delete predicates live once in core's `driveshare` package (`tinycld.org/core/driveshare`), shared with text and calc: `Role.CanWrite()` is true for owner and editor only, and every error path fails closed.

The collections' PocketBase access rules (settled by migration `1782100000_restore_guest_clause_and_settle_commentor.js`) let the item's creator or any share-holder read an item, restrict updates to the creator or a share-holder with role `editor` / `owner`, and restrict delete to the creator. `drive_shares` rows themselves are managed by the item's creator (recipients may delete — i.e. leave — their own share). Server endpoints that mutate items (`upload-version`, `restore-version`, the folder-download token) go through `resolveItemAndUser`, which loads the item and checks the caller's access via `driveshare.CheckWrite` / `driveshare.CheckReadItem`.

### Public share links

A `drive_share_links` row is the entire public-link state: `(item, role, token, expires_at, is_active, download_count, last_accessed_at, created_by)`. Tokens are 32 random bytes hex-encoded — 64 characters of `[0-9a-f]`, with a `UNIQUE` index. The token is generated at create time and never changes; disabling a link sets `is_active = false`, re-enabling restores it, and the same URL works again. Permanent invalidation requires `DELETE /api/drive/share-link/{id}`, after which any new link generated for the same item gets a fresh token. Collection access rules require **owner** role on the underlying item for any CRUD on the link — editors of a file cannot create or revoke its public links.

Public endpoints (`/api/drive/share-link/{token}`, `.../file`, `.../thumbnail`) sit behind an in-process IP-based rate limiter (60 requests per minute per source IP) shared across all three endpoints. `X-Forwarded-For` is honored when present so the limiter sees the real client behind a reverse proxy.

### Search

`fts_drive_items` is a SQLite FTS5 virtual table with columns `(record_id, name, description, content)`. The first three are synced eagerly from the corresponding `drive_items` columns inside the after-create / after-update hook (via `syncDriveItemToFTS`). `content` is filled asynchronously by `extractAndIndexDriveItem` once the extractor finishes.

`handleDriveSearch` builds a parameterized FTS5 `MATCH` query, joins through `drive_shares` to enforce per-user access (a `drive_shares` row with `user` equal to the caller's id must exist for the row to be returned — the owner self-share covers the creator's own items), and returns `snippet(..., '<mark>', '</mark>', '...', 30)` for client-side highlighting. Special FTS5 syntax characters (`:`, `*`, `^`, etc.) are stripped from user input before the MATCH so users can't accidentally write invalid queries.

### Thumbnails

`core/thumbnails.CanGenerate(mimeType)` says yes for:

- `application/pdf`
- `application/epub+zip`
- The OOXML Office types (`.docx`, `.xlsx`, `.pptx`) — legacy binary Office (`.doc`, `.xls`, `.ppt`) is deliberately unsupported since the doctaculous migration
- `image/heic`, `image/heif` (including the `-sequence` variants)

For documents, `doctaculous` renders the first page straight to a JPEG (quality 85) fitted within the target box, reading the storage blob into memory (capped at 50 MB) with no temp files. For HEIC/HEIF, `goheif.Decode` handles the iPhone-photo case Go's stdlib can't, resized with `imaging.Fit` (Lanczos).

Plain image types (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, SVG) are *not* in either list — PocketBase's built-in `?thumb=` query parameter serves on-demand thumbnails for them directly off the original file, so we don't pre-render those.

The thumbnail field is set on a *re-fetched* `drive_items` record (not the one the hook received) to avoid clobbering other concurrent writes. Skip-if-current logic compares the thumbnail's source filename to the original file's filename so a re-uploaded file regenerates but a touch-only update doesn't.

### WebDAV

The protocol server lives in core (`tinycld.org/core/webdav`): its `FileSystem` implements `webdav.FileSystem` over any PocketBase collection shaped as a tree, and drive contributes a `webdav.Source` (register.go's `webDAVSource`) mapping `drive_items`' fields plus a `BeforeOverwrite` hook that snapshots the outgoing blob so a WebDAV PUT gets the same version history as a UI upload. The path layout is `/dav/drive/<segments...>` — the root is a *synthetic* directory with no `drive_items` row. Underneath, every segment maps to a `drive_items` record by `(parent, name)`.

The flow per request:

1. The route middleware calls `davauth.Authenticate` (HTTP Basic, email or username + password), which `bcrypt`-compares against the `users` collection. Failure returns 401 with `WWW-Authenticate: Basic realm="TinyCld WebDAV"`, and repeated failures from one source are refused before spending bcrypt (`davauth.TooManyFailures`).
2. The authenticated user is stashed in the request context under `userKey`. FileSystem methods retrieve it via `userFromContext` — they never re-authenticate.
3. `resolveContext` reads the user off the context and parses the path into segments; per-operation authorization then evaluates `drive_items`' own PocketBase collection rules (list/view/create/update/delete), so WebDAV grants exactly what the REST API and the web UI grant. A denied read is masked as "not found" rather than 403, so an unreadable path's existence doesn't leak.

`webdav.NewMemLS()` is used for the lock system, which is enough to advertise DAV class 2; macOS Finder requires class 2 to mount read-write. Locks are in-memory and per-process, which is fine for a single-instance deployment — clustered deployments would need a shared lock backend.

WebDAV deletes are real deletes: `RemoveAll` deletes the `drive_items` row (permitted only where the collection's delete rule allows it — the creator), and PocketBase cascade rules remove the dependent shares, versions, and state rows with it.

### Versioning

`snapshotCurrentFile` is the single entry point for creating a version row, called from `handleUploadVersion`, `handleRestoreVersion`, and `handleSnapshotVersion`. It:

1. Reads the *current* file's bytes off the `drive_items` record's attached file.
2. Inside an `app.RunInTransaction`, queries `MAX(version_number) FROM drive_item_versions WHERE item = ?` and assigns `result.Max + 1`.
3. Inserts the `drive_item_versions` row with the current bytes, size, mime type, the calling user's id as `created_by`, a caller-supplied `label`, and a `source` of `upload`, `user`, or `system`.

The three `source` values let the UI distinguish how a version came into being:

- **`upload`** — user replaced the file via "Upload new version" in the right-click menu. Label is empty.
- **`user`** — user explicitly snapshotted the current bytes with a description, typically from a host package's "Save version" menu item. Label is whatever the user typed (trimmed and capped at 500 chars).
- **`system`** — automatic safety snapshot taken before a destructive operation (currently just `handleRestoreVersion`). Hidden from the Detail panel's version list — `useVersionHistory` filters with `source != 'system'`.

Version-number assignment in a transaction guarantees monotonicity even under concurrent uploads; the upper layer doesn't need to retry.

`handleSnapshotVersion` is the cheap path used by packages whose content already lives in the `drive_items` file (calc spreadsheets, text documents). It takes JSON `{item, label}`, validates write access via `resolveItemAndUser`, refuses items with no attached file (`422`, "nothing to snapshot — file is empty"), and snapshots in place. No file payload crosses the wire and no edit racing with autosave is possible because no bytes are written to `drive_items.file`.

`handleRestoreVersion` first snapshots the current file (with `source = "system"`) so restore is itself reversible, then copies the chosen version's bytes back onto `drive_items.file` and updates the item's size and mime type accordingly. Storage quota is pre-checked on the size delta before the restore proceeds (`core/quota`'s record hooks remain the authoritative enforcement).

PocketBase renames the on-disk blob to a fresh hash on every save, so the prior version of `drive_items.file` is still on disk until PB's cleanup pass — even if a flush goes wrong, the bytes are recoverable. Permanent delete of an item removes every version row with it.

### File viewer registry

The "Open in Calc" / "Open in Text" actions on a file in Drive aren't defined in drive — they're contributed by the consuming packages at module-load time via `@tinycld/core/file-viewer/preview-action-registry.registerPreviewAction(...)`. Drive's `PreviewModal` reads the registry and renders any action whose `match(mime)` returns true. This is why a fresh Drive install with no other packages linked has no "Open in X" actions but still shows generic previews — drive itself doesn't bundle any.

The save-to-drive action (allowing other packages to push a generated file into Drive) is the only registry entry drive contributes itself, in `lib/save-to-drive-action.tsx`.

### Folder download

Folder downloads work via a two-step token flow because a streaming zip response wants to be a `GET` (so browsers download it natively) but the authorization wants to be a `POST` (so credentials don't end up in URL bars and history). `POST /api/drive/download-token` validates access through `resolveItemAndUser`, generates a 32-byte hex token, stores `(folderID, expiresAt)` in an in-process map with a 60-second TTL, and returns the token + URL. The client immediately requests `GET /api/drive/download-folder?token=...`, which looks the token up (single-use — it's deleted on first fetch), walks the folder tree, and streams a zip of every file underneath, capped at 10,000 files and 5 GB total.

The token map is in-process and uses a background goroutine that runs every 5 minutes to evict expired entries. Restarting the server invalidates all in-flight download tokens; the client gracefully re-requests a new one on next click.

### Notifications and audit

`OnRecordAfterCreateSuccess("drive_shares")` fires a `drive_file_shared` notification through `core/notify` when the recipient (`user`) differs from the creator (`created_by`) — both are user ids. Owner self-shares — created by the item-create hook — match `userID == createdBy` and are skipped, so users don't get a notification every time they upload one of their own files.

`audit.RegisterCollection` is called for `drive_items`, `drive_item_state`, and `drive_shares`. Labels for `drive_items` use the `name` field; the other two need no customization.

## Platform support

| Feature                              | Web | iPad |
|--------------------------------------|-----|------|
| Browse / open / preview files        | ✅  | ✅   |
| Folder navigation (sidebar tree)     | ✅  | ✅   |
| Upload                               | ✅  | ✅ (Photos / Files pickers) |
| Drag-and-drop upload                 | ✅  | n/a  |
| Folder drag-and-drop                 | ✅  | n/a  |
| Download (file or folder zip)        | ✅  | n/a  |
| Rename / move / copy / trash         | ✅  | ✅   |
| Share with other users               | ✅  | ✅   |
| Public share links                   | ✅  | ✅   |
| Version history (view / restore)     | ✅  | ✅   |
| Search                               | ✅  | ✅   |
| WebDAV mount                         | OS-native (Finder / Explorer / Nautilus) | — |
| Realtime updates                     | ✅  | ✅   |

iPhone (small phone screens) isn't supported yet.

## Server package layout

```
server/
    register.go                Register / RegisterTenant — hooks, API endpoints,
                               quota sources, the core/webdav Source
    permissions.go             createOwnerShare (the read/write/delete predicates
                               live in core/driveshare)
    dedup_name.go              (parent, name) collision → "name (N)"
    storage_limits.go          per-user / deployment usage queries + settings
                               limit lookup (pre-flight checks; core/quota enforces)
    storage.go                 blob read/write helpers, size reconciliation
    items.go                   folder-depth bound + move-cycle check
    extract.go                 textextract → fts_drive_items.content
    thumbnails.go              core/thumbnails → drive_items.thumbnail
    search.go                  /api/drive/search (FTS5)
    versions.go                snapshotCurrentFile (txn, monotonic version_number)
    endpoints_share.go         /api/drive/share + invite emails
    endpoints_public_share.go  share-link create/list/delete + public token endpoints
    endpoints_share_session.go anonymous share sessions for public links
    endpoints_share_otp.go     email-verified guest provisioning (OTP) for links
    endpoints_download.go      folder-download token flow (POST then GET)
    endpoints_export.go        convert-and-download token flow
    bindings.go                $drive.* JS binding for server-side TS hooks
```

The WebDAV protocol server itself (FileSystem, auth, path parsing) lives in core at `tinycld/core/server/webdav/`; drive only supplies its `webdav.Source`.

Go module: `tinycld.org/packages/drive`. Imports `tinycld.org/core/{audit,coreserver,driveshare,notify,previewqueue,quota,textextract,thumbnails,userorg,versionhooks,webdav}` via the standard go.mod replace directive the app shell installs.

## Client package layout

```
tinycld/drive/
    manifest.ts        package manifest (slug, nav, sidebar, provider, server)
    sidebar.tsx        sections (My Files / Shared with me / Recent / Starred / Trash) + folder tree + storage bar
    provider.tsx       mounts SaveToDriveDialog; registers save-to-drive action
    collections.ts     drive_items / drive_shares / drive_item_state /
                       drive_item_versions / drive_share_links pbtsdb registration
    types.ts           DriveSchema (merged into MergedSchema)
    seed.ts            sample data
    screens/
        index.tsx              section view (My Files / Shared / Recent / Starred / Trash)
        recent.tsx             recent-files view
        [...path].tsx          deep-link folder view by path
    public-screens/
        share/[token].tsx      public-share landing page (/share/<token>)
    components/
        DriveToolbar           list/grid toggle, search, primary actions
        DriveContextMenu       right-click / long-press actions on a file or folder
        DropZone               web-only drag-and-drop, walks webkit FS entries
        FileUploadFAB          iPad floating action button (Photos / Files pickers)
        UploadButton, UploadStatusBar, UploadingGridCard, UploadingListRow
        PreviewModal           file viewer (consumes core's file-viewer registry)
        Thumbnail              renders drive_items.thumbnail or category icon fallback
        ShareDialog            per-user shares + public link controls (presentational)
        ShareDialogConnected   self-contained share dialog (loads its own data)
                               — usable from outside the Drive screen tree
                               (text and calc File menus)
        DetailPanel            details / versions / activity tabs
        ChooseFolderDialog     "Move to..." / "Copy to..." picker
        SaveToDriveDialog      cross-package "save this file to Drive"
        file-icons.ts          re-exports from @tinycld/core/file-viewer/file-icons
    hooks/
        useDrive.tsx           top-level state (active section, current folder,
                               breadcrumbs); also exports useDriveState (the
                               provider-bound variant that wires to URL params)
        useDriveMutations.ts   create folder, rename, move, copy, trash, restore,
                               download, public-link CRUD, share CRUD
        useFileUpload.ts       upload pipeline + folder-tree handling
        useUploadPlaceholders.ts  optimistic upload rows in the current view
        useVersionHistory.ts   list + restore versions
        useDriveSearch.ts      /api/drive/search hook
        use-folder-tree-query.ts  sidebar folder tree (export: useFolderTreeQuery)
        use-share-data.ts      collection-agnostic share data hook used by
                               ShareDialogConnected
    lib/
        copy-drive-item.ts     POST-then-recursive copy
        item-actions-registry.ts  registry for cross-package "Open in X" actions
        template-naming.ts     derive default names for new-from-template items
        save-to-drive.ts, save-to-drive-action.tsx, upload-to-drive.ts
    stores/
        upload-store.ts        zustand: uploading-files list (status + progress)
        drive-ui-store.ts      zustand: shared UI state (dialogs, view mode)
```

## Command line

Drive contributes a `drive` command group to the `tinycld` binary — a Go CLI the server cross-compiles and hands out from **Settings → Personal → About**. The source lives in this repo at `cli/`, declared through a `cli` block in `manifest.ts` naming the Go module and the OAuth scopes it requests: `drive:read` and `drive:write`.

| Group | Commands |
|-------|----------|
| Browsing | `ls`, `tree`, `search`, `cat` |
| Transfer | `get`, `put`, `export` |
| Organizing | `mkdir`, `mv`, `cp`, `rm`, `trash`, `restore` |
| Sharing | `share`, `link create`, `link list`, `link revoke` |
| History and usage | `versions`, `usage` |

Every path argument also accepts `id:<record-id>`, so a script that already holds a record id doesn't have to reconstruct its path. A `get` on a folder downloads it as a zip.

See [the command line tool](https://tinycld.org/docs/command-line-tool) for setup and authentication, the [full CLI reference](https://tinycld.org/docs/reference/cli-reference) for every flag, and the in-app help topic `help/command-line.md`.

## Development

```sh
# Clone the app shell and this package as siblings
cd ~/code/tinycld
git clone git@github.com:tinycld/tinycld.git
git clone git@github.com:tinycld/drive.git

# Install deps in the app shell
cd tinycld
pnpm install

# Link this package into the app shell
pnpm run packages:link ../drive

# Run the full stack
pnpm run dev
```

## Standalone checks

Lint and typecheck both run from the app shell — biome and TypeScript live there, and the app shell's tsconfig pulls in `expo`'s base config, `uniwind` type augments, and the live `~/types/pbSchema` generated from PocketBase, none of which a standalone invocation in this package can see. Biome's config lives in `tinycld/biome.json` and applies to every linked package (there is no `biome.json` in this repo).

```sh
cd ../tinycld
pnpm run packages:link ../drive    # only needed once per checkout
pnpm run lint                      # scans this package via the app's biome rules
pnpm run typecheck                 # full app-shell tsc
pnpm run test:unit                 # vitest, including this package's tests/
pnpm run test:go                   # go test on this package's server/
```

## CI

`.github/workflows/ci.yml` runs lint, typecheck, and vitest on every push to `main` and every PR. It clones `tinycld/tinycld@main` into a sibling directory, installs the app shell's deps, links this package in, and runs the checks — exactly what a developer does locally.

## Package anatomy

- `manifest.ts` — single source of truth for capabilities (routes, public routes, nav, sidebar, provider, collections, migrations, server module)

### Sidebar slot

Drive exposes one sidebar slot for other packages to extend:

- `sidebar.after-tree` — rendered below the folder tree, above the "Shared with me" / Recent / Starred section.

Other packages can target this slot via `sidebarContributions` in their manifest. See [Sidebar slots](https://tinycld.org/docs/anatomy/sidebar-slots) for the full contract.
- `package.json` — name, exports map, peer deps
- `tsconfig.json` — typecheck config (lint config lives in the app shell's `biome.json`)
- `pb-migrations/` — PocketBase migrations (symlinked into the app shell's server on `packages:generate`)
- `server/` — Go server module, registered by the generator
- `server/automation.go` — Go trigger filters, owner resolvers, and action handlers for the workflow-rules engine
- `cli/` — Go module contributing this package's `tinycld` command group
- `help/` — in-app help topics (markdown + frontmatter)
- `tests/` — vitest unit tests (sibling tests run from the app shell)
- `tinycld/drive/` — TypeScript source, including `automation.ts` (workflow-rules trigger and action definitions)
