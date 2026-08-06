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
    const drive_items = newCollection('drive_items', {
        omitOnInsert: [
            'created',
            'updated',
            'thumbnail',
            'thumb_region_hash',
            'index_hash',
        ] as const,
        expand: { created_by: coreStores.users },
        // On-demand: each useLiveQuery against drive_items issues a server
        // fetch with the where/orderBy translated into a PocketBase filter.
        // Avoids loading every item in the org just to render a single folder.
        syncMode: 'on-demand' as const,
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    const drive_shares = newCollection('drive_shares', {
        omitOnInsert: ['created', 'updated'] as const,
        expand: {
            item: drive_items,
            user: coreStores.users,
            created_by: coreStores.users,
        },
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    const drive_item_state = newCollection('drive_item_state', {
        omitOnInsert: ['created', 'updated'] as const,
        expand: { item: drive_items, user: coreStores.users },
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    const drive_item_versions = newCollection('drive_item_versions', {
        omitOnInsert: ['created', 'updated'] as const,
        expand: { item: drive_items, created_by: coreStores.users },
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    const drive_share_links = newCollection('drive_share_links', {
        omitOnInsert: ['created', 'updated'] as const,
        expand: { item: drive_items, created_by: coreStores.users },
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    // Drive owns the comment_mentions migration. Registering the store
    // here makes `useStore('comment_mentions')` available to any package
    // that depends on drive (text, calc-comments, …).
    const comment_mentions = newCollection('comment_mentions', {
        omitOnInsert: ['created'] as const,
        expand: {
            drive_item: drive_items,
            mentioned_user: coreStores.users,
        },
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
