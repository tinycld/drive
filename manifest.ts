const manifest = {
    name: 'Drive',
    slug: 'drive',
    version: '0.2.0',
    description: 'Cloud file storage for your organization',
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
    server: { package: 'server', module: 'tinycld.org/packages/drive' },
    repository: { url: 'https://github.com/tinycld/drive' },
    peerVersions: { '@tinycld/core': '>=0.4.0 <0.5.0' },
}

export default manifest
