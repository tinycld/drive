const manifest = {
    name: 'Docs',
    slug: 'docs',
    version: '0.1.0',
    description: 'Collaborative document editing for your organization',
    routes: { directory: 'screens' },
    nav: { label: 'Docs', icon: 'pen-line', order: 11 },
    sidebar: { component: 'sidebar' },
    migrations: { directory: 'pb-migrations' },
    collections: { register: 'collections', types: 'types' },
    seed: { script: 'seed' },
}

export default manifest
