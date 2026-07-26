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
    repository: { url: 'https://github.com/tinycld/drive' },
    peerVersions: { '@tinycld/core': '>=0.4.0 <0.5.0' },
}

export default manifest
