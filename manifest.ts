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
    // Server-side TS hooks: drop a *.pb.ts into pb-hooks/ to extend drive
    // alongside the Go — including the WebDAV interception points
    // (webdavHook) and the $drive.* bindings the server exposes.
    hooks: { directory: 'pb-hooks' },
    // WebDAV over /drive, served by core (tinycld.org/core/webdav). This is the
    // same Source the Go server registers; declaring it here is what lets a
    // multi-org tenant — which links no feature Go — still serve WebDAV, since
    // the router materializes this block into the tenant's runtime config.
    //
    // Authorization, quota and versioning are NOT expressible here; they are Go
    // callbacks in server/register.go. A tenant therefore gets the protocol and
    // the tree, with core's default (authenticated) access model.
    webdav: {
        prefix: '/drive',
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
    },
    repository: { url: 'https://github.com/tinycld/drive' },
    peerVersions: { '@tinycld/core': '>=0.4.0 <0.5.0' },
}

export default manifest
