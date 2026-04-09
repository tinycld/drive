import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { usePocketBase } from '~/lib/pocketbase'
import { defaultSheetId, defaultSheetMeta } from '../lib/cell-utils'
import { PBSyncProvider } from '../lib/pb-sync-provider'
import { YjsPersistence } from '../lib/yjs-persistence'

interface UseYjsSyncOptions {
    workbookId: string
    userOrgId: string
}

interface UseYjsSyncResult {
    doc: Y.Doc | null
    isSynced: boolean
}

/**
 * Manages the Y.Doc lifecycle for a workbook:
 * - Creates a Y.Doc
 * - Loads from local persistence
 * - Connects PB sync provider
 * - Initializes default sheet if empty
 */
export function useYjsSync({ workbookId, userOrgId }: UseYjsSyncOptions): UseYjsSyncResult {
    const pb = usePocketBase()
    const [isSynced, setIsSynced] = useState(false)
    const docRef = useRef<Y.Doc | null>(null)
    const providerRef = useRef<PBSyncProvider | null>(null)
    const persistenceRef = useRef<YjsPersistence | null>(null)

    if (!docRef.current && workbookId) {
        docRef.current = new Y.Doc()
    }

    useEffect(() => {
        const doc = docRef.current
        if (!doc || !workbookId || !userOrgId) return

        let cancelled = false
        const persistence = new YjsPersistence(workbookId, doc)
        persistenceRef.current = persistence

        const provider = new PBSyncProvider({
            workbookId,
            userOrgId,
            pb,
            doc,
        })
        providerRef.current = provider

        provider.onSynced = () => {
            if (cancelled) return
            // Initialize default sheet if the doc is empty
            const sheets = doc.getMap('sheets')
            if (sheets.size === 0) {
                const sheetId = defaultSheetId()
                const meta = new Y.Map()
                const defaults = defaultSheetMeta()
                meta.set('name', defaults.name)
                meta.set('position', defaults.position)
                meta.set('frozenRows', defaults.frozenRows)
                meta.set('frozenCols', defaults.frozenCols)
                sheets.set(sheetId, meta)
            }
            setIsSynced(true)
        }

        async function init() {
            await persistence.load()
            persistence.startAutoSave()
            if (!cancelled) {
                await provider.connect()
            }
        }

        init()

        return () => {
            cancelled = true
            provider.destroy()
            persistence.destroy()
            providerRef.current = null
            persistenceRef.current = null
        }
    }, [workbookId, userOrgId, pb])

    return { doc: docRef.current, isSynced }
}
