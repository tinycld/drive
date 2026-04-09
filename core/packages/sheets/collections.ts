import type { createCollection } from 'pbtsdb'
import { BasicIndex } from 'pbtsdb'
import type { CoreStores } from '~/lib/pocketbase'
import type { Schema } from '~/types/pbSchema'
import type { SheetsSchema } from './types'

type MergedSchema = Schema & SheetsSchema

export function registerCollections(
    newCollection: ReturnType<typeof createCollection<MergedSchema>>,
    coreStores: CoreStores
) {
    const sheets_workbooks = newCollection('sheets_workbooks', {
        omitOnInsert: ['created', 'updated'] as const,
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    const sheets_snapshots = newCollection('sheets_snapshots', {
        omitOnInsert: ['created', 'updated'] as const,
        expand: { workbook: sheets_workbooks },
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    const sheets_updates = newCollection('sheets_updates', {
        omitOnInsert: ['created', 'updated'] as const,
        expand: {
            workbook: sheets_workbooks,
            user_org: coreStores.user_org,
        },
        collectionOptions: {
            autoIndex: 'eager' as const,
            defaultIndexType: BasicIndex,
        },
    })

    return {
        sheets_workbooks,
        sheets_snapshots,
        sheets_updates,
    }
}
