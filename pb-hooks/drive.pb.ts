/// <reference path="../../tinycld/server/pb_data/types.d.ts" />

// Drive server-side TS hooks (runs on the sobek jsvm in both the single-tenant
// app and multi-org tenants).
//
// This is the customization seam: drive's core behavior — the WebDAV server,
// per-item authorization, quota, versioning, full-text search, thumbnails —
// lives in Go and runs REGARDLESS of this file. Add TS here to layer extra
// behavior on top without forking the Go.
//
// ── WebDAV interception ──────────────────────────────────────────────────────
//
// webdavHook({...}) registers handlers at five points in the WebDAV request
// path. Each is OPT-IN: a point nobody registers costs a single atomic load and
// never touches the JS runtime, so a deployment that customizes nothing pays
// nothing. Register one and only that point moves onto the slow path.
//
//   beforeWrite(e)   PUT and MKCOL, before anything is created.
//                    e = { slug, op, name, path, userId, isCreate }
//                    Throw to reject the write.
//
//   beforeDelete(e)  DELETE. e = { slug, op, id, name, path, userId }
//                    Throw to reject the delete.
//
//   beforeMove(e)    MOVE. e = { slug, op, id, name, from, to, userId }
//                    Throw to reject the move.
//
//   canRead(e)       Per entry, AFTER Go has already authorized it.
//                    e = { slug, id, name, userId }
//                    Return false to hide the entry.
//
//   filterList(e)    Once per directory listing, with the whole batch.
//                    e = { slug, userId, items: string[] }
//                    Return the subset of names to keep.
//
// SECURITY: these points can only RESTRICT. Go's own authorization runs first
// and short-circuits, and a name filterList returns that Go did not authorize is
// discarded — a hook can hide entries, never reveal them.
//
// Example (commented out — uncomment to enable):
//
//     webdavHook({
//         beforeWrite(e) {
//             if (e.name.endsWith('.exe')) {
//                 throw new Error('executables are not allowed in Drive')
//             }
//         },
//         filterList(e) {
//             return e.items.filter(function (n) { return n[0] !== '.' })
//         },
//     })
//
// ── Record hooks ─────────────────────────────────────────────────────────────
//
// You can also bind onRecordCreate/onRecordUpdate/onRecordDelete('drive_items')
// to react to the same events the Go server does, and call the Go-backed
// $drive.* bindings:
//
//     const { items, total } = $drive.search(userId, { q: 'budget', limit: 10 })
//
// Note: the fork's TS→JS hook transpile wraps each callback, so top-level module
// bindings (a `const` or `function` declared outside the callback) are NOT in
// scope at request time — keep everything a handler needs inside its own body.
//
// The no-op below is live so this file transpiles to real JS: an all-comment
// .pb.ts compiles to an empty module, which the loader rejects with
// "sourcemap: mappings are empty".
onRecordCreate((e) => {
    e.next()
}, 'drive_items')

