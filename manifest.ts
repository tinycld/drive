const manifest = {
    name: 'Drive',
    slug: 'drive',
    version: '0.4.0',
    description: 'Cloud file storage, with WebDAV',
    routes: { directory: 'screens' },
    publicRoutes: { directory: 'public-screens' },
    nav: { label: 'Drive', icon: 'hard-drive', order: 12, shortcut: 'd' },
    sidebar: { component: 'sidebar' },
    slots: ['sidebar.after-tree'],
    provider: { component: 'provider' },
    help: { directory: 'help' },
    // Drive is searchable through core's federated /api/search, which reads the
    // Go source registered in server/. The in-app search box keeps its own
    // /api/drive/search route: it filters the grid in place and needs
    // drive-shaped fields the normalized row does not carry.
    search: { adapter: 'search-adapter' },
    migrations: { directory: 'pb-migrations' },
    collections: { register: 'collections', types: 'types' },
    // Trigger + action catalog for workflow rules. The definitions are data;
    // server/automation.go adds the Go the engine requires alongside them: the
    // file-added owner resolver (destination-folder participants, not just the
    // uploader) and the move-to-folder destination authorizer.
    automation: { definitions: 'automation' },
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
    // `tinycld drive ...` commands, compiled into the per-deployment CLI binary by
    // gen-cli.ts. The OAuth scopes the commands need are registered by
    // server/oauth_scopes.go, never declared here.
    // Cobra is the source of truth for the command list and --help.
    cli: {
        package: 'cli',
        module: 'tinycld.org/packages/drive/cli',
    },
    // Server-side TS hooks: drop a *.pb.ts into pb-hooks/ to extend drive
    // alongside the Go — including the WebDAV interception points
    // (webdavHook) and the $drive.* bindings the server exposes.
    hooks: { directory: 'pb-hooks' },
    // WebDAV (the webdav.Source core mounts at /drive) and the storage-quota
    // sources are not declared here: both live in server/register.go.
    repository: { url: 'https://github.com/tinycld/drive' },
    peerVersions: { '@tinycld/core': '>=0.6.3 <0.7.0' },
}

export default manifest
