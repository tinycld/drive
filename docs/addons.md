# TinyCld Add-on System

TinyCld supports third-party add-ons distributed as npm packages. Add-ons provide screens, PocketBase collections/migrations, server-side hooks, and navigation items — all scoped to an organization.

## How it works

A code generation script (`scripts/generate-addons.ts`) reads `tinycld.addons.ts`, resolves each addon package, and wires everything into the places the existing stack expects:

- **Route re-exports** in `app/app/[orgSlug]/{slug}/` so One's file-based router picks them up
- **Typed collection registration** in `lib/generated/addon-collections.ts` so pbtsdb knows about addon collections
- **Addon registry** in `lib/generated/addon-registry.ts` for runtime access to addon metadata
- **Symlinks** for PocketBase migrations and hooks into `server/pb_migrations/` and `server/pb_hooks/`

No framework patches, no runtime magic. The generation runs before `dev` and `build` via npm lifecycle hooks.

## Quick start

### Install an addon

1. Add the package to your dependencies (or as a workspace package under `packages/`).

2. Register it in `tinycld.addons.ts`:
    ```typescript
    export const addons = [
        '@tinycld/contacts',
    ] as const
    ```

3. Run the generation script:
    ```sh
    npm run addons:generate
    ```

4. Start development:
    ```sh
    npm run dev
    ```

### Remove an addon

1. Remove the package name from `tinycld.addons.ts`.
2. Run `npm run addons:generate` — the script cleans up all previously generated files and symlinks.
3. Remove the package dependency.

## Creating an addon

### Package structure

```
packages/example/
    package.json            # npm package with exports map
    manifest.ts             # addon metadata
    types.ts                # TypeScript schema types
    collections.ts          # pbtsdb collection registration
    seed.ts                 # sample data for development (optional)
    screens/
        _layout.tsx         # section layout
        index.tsx           # list screen
        [id].tsx            # detail screen
    pb-migrations/
        1712000000_init.js  # PocketBase migration
    pb-hooks/
        (optional)          # PocketBase JS hooks
    hooks/
        useExample.ts       # custom React hooks
    components/
        ExampleCard.tsx     # shared components
    tests/
        example.spec.ts     # Playwright e2e tests (optional)
```

### manifest.ts

The manifest describes the addon to the generation script. Export a default object:

```typescript
const manifest = {
    name: 'Example',            // human-readable name
    slug: 'example',            // URL segment and collection prefix
    version: '0.1.0',
    description: 'An example addon',

    routes: { directory: 'screens' },

    nav: {
        label: 'Example',
        icon: 'box',           // icon name from icon library
        order: 20,             // sort priority in navigation
    },

    migrations: { directory: 'pb-migrations' },

    // hooks: { directory: 'pb-hooks' },   // optional

    collections: {
        register: 'collections',    // subpath to registerCollections module
        types: 'types',             // subpath to schema type module
    },

    seed: { script: 'seed' },              // optional — subpath to seed module
    tests: { directory: 'tests' },         // optional — directory containing Playwright specs

    // dependencies: ['other-addon-slug'],  // optional
}

export default manifest
```

### types.ts

Define the TypeScript interface for your collection records and a schema type that integrates with pbtsdb's type system:

```typescript
import type { Orgs, Users } from '~/types/pbSchema'

export interface Example {
    id: string
    title: string
    org: string
    created_by: string
    created: string
    updated: string
}

export type ExampleSchema = {
    example: {
        type: Example
        relations: {
            org: Orgs
            created_by: Users
        }
    }
}
```

The interface must match the PocketBase collection schema defined in your migration. The schema type name must follow the convention `{PascalSlug}Schema` (e.g., slug `example` becomes `ExampleSchema`, slug `task-lists` becomes `TaskListsSchema`).

### collections.ts

Register your collections with pbtsdb. The function receives a typed `newCollection` factory and the core stores:

```typescript
import type { createCollection } from 'pbtsdb'
import { BasicIndex } from 'pbtsdb'
import type { Schema } from '~/types/pbSchema'
import type { CoreStores } from '~/lib/pocketbase'
import type { ExampleSchema } from './types'

type MergedSchema = Schema & ExampleSchema

export function registerCollections(
    newCollection: ReturnType<typeof createCollection<MergedSchema>>,
    coreStores: CoreStores,
) {
    const example = newCollection('example', {
        omitOnInsert: ['created', 'updated'] as const,
        expand: { org: coreStores.orgs },
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })
    return { example }
}
```

The `MergedSchema` type is a local intersection of the core schema and your addon's schema. This gives `newCollection` the type information to accept your collection name and infer the correct record type. The return object's keys become the names usable with `useStore()`.

### package.json

Each screen file must be explicitly listed in the exports map so TypeScript can resolve the re-export imports:

```json
{
    "name": "@tinycld/example",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "exports": {
        "./package.json": "./package.json",
        "./manifest": "./manifest.ts",
        "./types": "./types.ts",
        "./collections": "./collections.ts",
        "./screens/_layout": "./screens/_layout.tsx",
        "./screens/index": "./screens/index.tsx",
        "./screens/[id]": "./screens/[id].tsx",
        "./hooks/*": "./hooks/*",
        "./components/*": "./components/*"
    },
    "peerDependencies": {
        "react": ">=19",
        "react-native": ">=0.83",
        "one": ">=1.13",
        "pbtsdb": ">=0.3",
        "@tanstack/react-db": ">=0.1",
        "@tanstack/db": ">=0.6"
    }
}
```

### Screens

Screens are standard One/Expo route files. They live in the addon's `screens/` directory and are re-exported into `app/app/[orgSlug]/{slug}/` by the generation script. This means screens run inside the app's bundle context and can import from the host app using `~/`:

```typescript
import { useStore } from '~/lib/pocketbase'
import { useAuth } from '~/lib/auth'
```

Route parameters include `orgSlug` from the parent `[orgSlug]` segment.

### Hooks

Place custom React hooks in `hooks/`. Import collections via `useStore` from `~/lib/pocketbase` and query with `useLiveQuery` from `@tanstack/react-db`:

```typescript
import { useLiveQuery } from '@tanstack/react-db'
import { useStore } from '~/lib/pocketbase'

export function useExamples() {
    const [exampleCollection] = useStore('example')

    const { data, isLoading } = useLiveQuery((query) =>
        query
            .from({ example: exampleCollection })
            .orderBy(({ example }) => example.title, 'asc'),
    )

    return { examples: data ?? [], isLoading }
}
```

### PocketBase migrations

Follow the same format as core migrations in `server/pb_migrations/`. Use a timestamp-based filename. The generation script symlinks these into `server/pb_migrations/` so PocketBase picks them up automatically.

```javascript
/// <reference path="../../../server/pb_data/types.d.ts" />
migrate(
    (app) => {
        const collection = new Collection({
            id: 'example',
            name: 'example',
            type: 'base',
            system: false,
            fields: [
                // ... field definitions
            ],
        })
        return app.save(collection)
    },
    (app) => {
        const collection = app.findCollectionByNameOrId('example')
        return app.delete(collection)
    },
)
```

### PocketBase hooks (optional)

Place `.pb.js` files in a `pb-hooks/` directory and declare it in the manifest. These are symlinked into `server/pb_hooks/`.

### seed.ts (optional)

Addons can provide a seed script that populates sample data for development. The script exports a default async function that receives a PocketBase client and a context object with the seeded user, org, and userOrg:

```typescript
import type PocketBase from 'pocketbase'

interface SeedContext {
    user: { id: string }
    org: { id: string }
    userOrg: { id: string }
}

export default async function seed(pb: PocketBase, { userOrg }: SeedContext) {
    await pb.collection('example').create({
        title: 'Sample item',
        owner: userOrg.id,
    })
}
```

Declare the seed in your manifest with `seed: { script: 'seed' }` and add a `"./seed": "./seed.ts"` entry to your package.json exports map.

The generation script produces `lib/generated/addon-seeds.ts`, which imports each addon's seed function. `scripts/seed-db.ts` calls all addon seeds after creating the test user and org (via `npm run db:seed`).

### tests/ (optional)

Addons can include Playwright e2e tests in a `tests/` directory. Declare it in the manifest with `tests: { directory: 'tests' }`.

Test files should follow the `*.spec.ts` naming convention:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Example', () => {
    test('list screen renders', async ({ page }) => {
        await page.goto('/app/test-org/example')
        await expect(page.getByText('Example')).toBeVisible()
    })
})
```

The Playwright config (`playwright.config.ts`) automatically globs `packages/*/tests/**/*.spec.ts`, so addon tests are discovered without any extra configuration. Run all e2e tests with `npm run test:e2e`.

## Type system

The addon type system is fully integrated with pbtsdb — no `any` types anywhere in the chain.

### How types flow

```
Addon types.ts         → defines ExampleSchema
                          ↓
Generation script      → generates MergedSchema = Schema & ExampleSchema
                          ↓
lib/pocketbase.ts      → createCollection<MergedSchema>(pb, queryClient)
                          ↓
createReactProvider    → useStore knows all collection names and record types
                          ↓
Addon hooks            → useStore('example') returns fully typed collection
                          ↓
Addon screens          → data from useLiveQuery has correct field types
```

### CoreStores type

Addons that reference core collections (e.g., for `expand` configs) import `CoreStores` from `~/lib/pocketbase`. This is a type-only import — no circular runtime dependency.

### MergedSchema

The generated `lib/generated/addon-collections.ts` creates a `MergedSchema` type that intersects the core `Schema` with all addon schemas. This is used as the type parameter for `createCollection`, making both core and addon collection names valid.

## Generation script details

`scripts/generate-addons.ts` performs five operations:

### 1. Route generation

For each addon, walks its screens directory and creates thin re-export files:

```
packages/contacts/screens/index.tsx
    → app/app/[orgSlug]/contacts/index.tsx
    → contains: export { default } from '@tinycld/contacts/screens/index'
```

Nested screens and layouts are preserved. Only `.tsx`, `.ts`, `.jsx`, `.js` files are processed.

### 2. Backend symlinks

Symlinks each file from the addon's `pb-migrations/` and `pb-hooks/` directories into the corresponding `server/` directories.

### 3. Collection registration

Generates `lib/generated/addon-collections.ts` with:
- Type imports for each addon's schema
- A `MergedSchema` type combining all schemas
- A typed `addonStores()` function that calls each addon's `registerCollections()`

### 4. Addon registry

Generates `lib/generated/addon-registry.ts` with an array of all addon manifests plus their package names.

### 5. Addon seeds

Generates `lib/generated/addon-seeds.ts` with imports and a record of each addon's seed function (for addons that declare `seed` in their manifest). This file is consumed by `scripts/seed-db.ts`.

### Cleanup

The script tracks all generated files and symlinks in `.addon-links.json`. On subsequent runs, it removes everything from the previous run before generating fresh output. Removing an addon from `tinycld.addons.ts` and re-running is sufficient to fully clean up.

## Runtime hooks

Access addon metadata at runtime using hooks from `lib/addons/use-addons.ts`:

```typescript
import { useAddons, useAddon } from '~/lib/addons/use-addons'

// Get all installed addons (for rendering navigation)
const addons = useAddons()

// Get a specific addon by slug
const contacts = useAddon('contacts')
```

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run addons:generate` | Run the generation script manually |
| `npm run dev` | Runs `addons:generate` automatically via `predev` hook, then starts dev |
| `npm run build:web` | Runs `addons:generate` automatically via `prebuild:web` hook, then builds |

## Files and directories

### Gitignored (generated)

- `lib/generated/` — typed collection wiring, addon registry, and addon seeds
- `app/app/[orgSlug]/*/` — generated route re-exports (excluding `_layout.tsx`)
- `.addon-links.json` — symlink tracking manifest

### Checked in (core)

- `tinycld.addons.ts` — addon configuration
- `app/app/[orgSlug]/_layout.tsx` — org-scoped layout (force-add with `git add -f`)
- `lib/addons/types.ts` — `AddonManifest` interface
- `lib/addons/use-addons.ts` — runtime hooks
- `scripts/generate-addons.ts` — generation script
- `packages/*/` — workspace addon packages

## Reference: AddonManifest interface

```typescript
interface AddonManifest {
    name: string            // "Calendar"
    slug: string            // "calendar"
    version: string         // "1.0.0"
    description: string

    routes: {
        directory: string   // relative path to screens, e.g. "screens"
    }

    nav: {
        label: string       // navigation label
        icon: string        // icon name
        order?: number      // sort priority
    }

    migrations?: {
        directory: string   // e.g. "pb-migrations"
    }

    hooks?: {
        directory: string   // e.g. "pb-hooks"
    }

    collections?: {
        register: string    // subpath to registerCollections module
        types: string       // subpath to schema types module
    }

    seed?: {
        script: string      // subpath to seed module, e.g. "seed"
    }

    tests?: {
        directory: string   // e.g. "tests"
    }

    dependencies?: string[] // slugs of other addons this depends on
}
```
