const manifest = {
    name: 'Drive',
    slug: 'drive',
    version: '0.1.0',
    description: 'Cloud file storage for your organization',
    routes: { directory: 'screens' },
    nav: { label: 'Drive', icon: 'hard-drive', order: 12 },
    sidebar: { component: 'sidebar' },
    provider: { component: 'provider' },
    migrations: { directory: 'pb-migrations' },
    collections: { register: 'collections', types: 'types' },
    seed: { script: 'seed' },
    server: { package: 'server', module: 'tinycld.org/addons/drive' },
}

export default manifest
