import type { createCollection } from 'pbtsdb'
import { BasicIndex } from 'pbtsdb'
import type { CoreStores } from '~/lib/pocketbase'
import type { Schema } from '~/types/pbSchema'
import type { DocsSchema } from './types'

type MergedSchema = Schema & DocsSchema

export function registerCollections(
    newCollection: ReturnType<typeof createCollection<MergedSchema>>,
    _coreStores: CoreStores
) {
    const doc_contents = newCollection('doc_contents', {
        omitOnInsert: ['created', 'updated'] as const,
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    return {
        doc_contents,
    }
}
