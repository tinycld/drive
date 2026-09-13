import type { CoreStores } from '@tinycld/core/lib/pocketbase'
import type { Schema } from '@tinycld/core/types/pbSchema'
import type { createCollection } from 'pbtsdb/core'
import { BasicIndex } from 'pbtsdb/core'
import type { DriveSchema } from './types'

// Replace (not intersect) the generated entries for drive's own collections —
// a plain intersection would merge each overlapping entry field-wise, letting
// a generated `any` absorb any typed override (see mail's collections.ts).
type MergedSchema = Omit<Schema, keyof DriveSchema> & DriveSchema

export function registerCollections(
    newCollection: ReturnType<typeof createCollection<MergedSchema>>,
    coreStores: CoreStores
) {
    // Hoisted rather than written inline at each call site: an inline object
    // literal here defeats pbtsdb's `alwaysFetchRelations` key inference (the
    // keys resolve to `never`), so every collection references this const.
    const indexing = { autoIndex: 'eager' as const, defaultIndexType: BasicIndex }

    const drive_items = newCollection('drive_items', {
        omitOnInsert: [
            'created',
            'updated',
            'thumbnail',
            'thumb_region_hash',
            'index_hash',
        ] as const,
        relations: { created_by: coreStores.users },
        // On-demand: each useLiveQuery against drive_items issues a server
        // fetch with the where/orderBy translated into a PocketBase filter.
        // Avoids loading every item in the org just to render a single folder.
        syncMode: 'on-demand' as const,
        collectionOptions: indexing,
    })

    // `alwaysFetchRelations: ['item']` on the collections below is deliberate and
    // load-bearing: drive_items is syncMode 'on-demand', so a share / state /
    // version row can reference an item this client never queried, and filing it
    // through the parent's expand is the only thing that puts it in the store.
    // Relations whose target is EAGER (users, here) need no entry — that store
    // syncs itself, so fetching them would only add payload. Rows never carry
    // `expand`; read the item from drive_items with materialize(), a join, or get().
    const drive_shares = newCollection('drive_shares', {
        omitOnInsert: ['created', 'updated'] as const,
        relations: {
            item: drive_items,
            user: coreStores.users,
            created_by: coreStores.users,
        },
        alwaysFetchRelations: ['item'],
        collectionOptions: indexing,
    })

    const drive_item_state = newCollection('drive_item_state', {
        omitOnInsert: ['created', 'updated'] as const,
        relations: { item: drive_items, user: coreStores.users },
        alwaysFetchRelations: ['item'],
        collectionOptions: indexing,
    })

    const drive_item_versions = newCollection('drive_item_versions', {
        omitOnInsert: ['created', 'updated'] as const,
        relations: { item: drive_items, created_by: coreStores.users },
        alwaysFetchRelations: ['item'],
        collectionOptions: indexing,
    })

    const drive_share_links = newCollection('drive_share_links', {
        omitOnInsert: ['created', 'updated'] as const,
        relations: { item: drive_items, created_by: coreStores.users },
        alwaysFetchRelations: ['item'],
        collectionOptions: indexing,
    })

    // The shared mentions table is CORE's now (its 1985000003 creates it,
    // and core registers a store for it unconditionally) — this registration
    // is drive's RICHER instance, expanded over drive_items for the
    // document packages (text, calc). Package stores spread after core's in
    // the map, so this one wins whenever drive is assembled; core's serves
    // everyone else. Historical note: the table began life in this package
    // (pb-migrations/1781000000, now create-or-adapt) back when every
    // mention was a drive-document mention.
    const comment_mentions = newCollection('comment_mentions', {
        omitOnInsert: ['created'] as const,
        relations: {
            drive_item: drive_items,
            mentioned_user: coreStores.users,
        },
        alwaysFetchRelations: ['drive_item'],
    })

    return {
        drive_items,
        drive_shares,
        drive_item_state,
        drive_item_versions,
        drive_share_links,
        comment_mentions,
    }
}
