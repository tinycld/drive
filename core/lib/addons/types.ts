export interface AddonManifest {
    name: string
    slug: string
    version: string
    description: string

    routes: {
        directory: string
    }

    nav: {
        label: string
        icon: string
        order?: number
    }

    migrations?: {
        directory: string
    }

    hooks?: {
        directory: string
    }

    collections?: {
        register: string
        types: string
    }

    sidebar?: {
        component: string
    }

    settings?: {
        slug: string
        component: string
        label: string
    }[]

    seed?: {
        script: string
    }

    tests?: {
        directory: string
    }

    server?: {
        package: string
        module: string
    }

    dependencies?: string[]
}
