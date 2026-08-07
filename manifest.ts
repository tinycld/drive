const manifest = {
    name: 'Drive',
    slug: 'drive',
    version: '0.2.2',
    description: 'Cloud file storage, with WebDAV',
    routes: { directory: 'screens' },
    publicRoutes: { directory: 'public-screens' },
    nav: { label: 'Drive', icon: 'hard-drive', order: 12, shortcut: 'd' },
    sidebar: { component: 'sidebar' },
    slots: ['sidebar.after-tree'],
    provider: { component: 'provider' },
    help: { directory: 'help' },
    migrations: { directory: 'pb-migrations' },
    collections: { register: 'collections', types: 'types' },
    seed: { script: 'seed' },
    // Go server extension: the drive_items hooks (quota, dedup, owner share,
    // move-cycle guard), FTS + /api/drive/search, share links, versions, and the
    // webdav.Source that core's WebDAV server is driven by.
    server: { package: 'server', module: 'tinycld.org/packages/drive' },
    // The API payload contract (server/api) generated into
    // @tinycld/app-generated/drive-api — the client imports those types, so
    // the peerVersions floor below must stay >= the core that ships the
    // emitter.
    payloads: { package: 'server/api' },
    // `tinycld drive ...` commands, compiled into the per-org CLI binary by
    // gen-cli.ts. scopes feed the OAuth scope registry and consent screen;
    // Cobra is the source of truth for the command list and --help.
    cli: {
        package: 'cli',
        module: 'tinycld.org/packages/drive/cli',
        scopes: ['drive:read', 'drive:write'],
    },
    // Server-side TS hooks: drop a *.pb.ts into pb-hooks/ to extend drive
    // alongside the Go — including the WebDAV interception points
    // (webdavHook) and the $drive.* bindings the server exposes.
    hooks: { directory: 'pb-hooks' },
    // WebDAV over /drive, served by core (tinycld.org/core/webdav). This is the
    // same Source the Go server registers; a multi-org tenant serves WebDAV
    // from this block (the router materializes it into the tenant's runtime
    // config), which is why the Go-side mount is host-only — drive's other Go
    // links into tenants via RegisterTenant, but the tenant's DAV mounts come
    // from here.
    //
    // Authorization comes from drive_items' own PocketBase rules and the storage
    // ceiling from the quota block below, so a tenant enforces both. Only the
    // version snapshot on overwrite is still a Go callback and absent there.

    // Storage-bearing collections. core/quota binds the enforcement hooks from
    // this, so the ceiling holds on every write path — and in a multi-org
    // tenant, where the router materializes this block into quota.json.
    quota: [
        { collection: 'drive_items', sizeField: 'size', ownerField: 'created_by' },
        { collection: 'drive_item_versions', sizeField: 'size', ownerField: 'created_by' },
    ],
    webdav: {
        prefix: '/dav/drive',
        collection: 'drive_items',
        fields: {
            name: 'name',
            parent: 'parent',
            isFolder: 'is_folder',
            size: 'size',
            mimeType: 'mime_type',
            file: 'file',
            owner: 'created_by',
            updated: 'updated',
        },
        // DAV DELETE stamps the per-user trash state (restorable from the
        // Trash screen) instead of destroying the record — Finder's "Move to
        // Trash" must behave like the web UI's.
        trash: {
            collection: 'drive_item_state',
            itemField: 'item',
            userField: 'user',
            trashedAtField: 'trashed_at',
        },
    },
    repository: { url: 'https://github.com/tinycld/drive' },
    peerVersions: { '@tinycld/core': '>=0.0.5 <0.1.0' },
}

export default manifest
