import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Y from 'yjs'
import { captureException } from '~/lib/errors'
import { base64ToUint8Array, uint8ArrayToBase64 } from './pb-sync-provider'

const STORAGE_PREFIX = 'yjs_sheets_'

/**
 * Persists a Y.Doc to AsyncStorage for offline support.
 * On web, AsyncStorage falls back to localStorage/IndexedDB.
 */
export class YjsPersistence {
    private key: string
    private doc: Y.Doc
    private debounceTimer: ReturnType<typeof setTimeout> | null = null
    private destroyed = false

    constructor(workbookId: string, doc: Y.Doc) {
        this.key = `${STORAGE_PREFIX}${workbookId}`
        this.doc = doc
    }

    async load() {
        try {
            const stored = await AsyncStorage.getItem(this.key)
            if (stored) {
                const bytes = base64ToUint8Array(stored)
                Y.applyUpdate(this.doc, bytes, 'persistence')
            }
        } catch (err) {
            captureException('Failed to load Y.Doc from storage:', err)
        }
    }

    startAutoSave() {
        this.doc.on('update', this.handleUpdate)
    }

    destroy() {
        this.destroyed = true
        this.doc.off('update', this.handleUpdate)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
    }

    private handleUpdate = () => {
        if (this.destroyed) return
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => this.save(), 1000)
    }

    private async save() {
        if (this.destroyed) return
        try {
            const state = Y.encodeStateAsUpdate(this.doc)
            await AsyncStorage.setItem(this.key, uint8ArrayToBase64(state))
        } catch (err) {
            captureException('Failed to save Y.Doc to storage:', err)
        }
    }
}
