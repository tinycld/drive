import type PocketBase from 'pocketbase'
import * as Y from 'yjs'
import { captureException } from '~/lib/errors'

const DEBOUNCE_MS = 300
const COMPACT_THRESHOLD = 50

interface PBSyncProviderOptions {
    workbookId: string
    userOrgId: string
    pb: PocketBase
    doc: Y.Doc
}

/**
 * Custom Yjs sync provider that uses PocketBase as the transport.
 *
 * Flow:
 * 1. On load: fetch latest snapshot + incremental updates after it
 * 2. On local change: debounce and POST binary update to sheets_updates
 * 3. On remote change (SSE): apply update to local Y.Doc
 * 4. Periodically compact updates into snapshots
 */
export class PBSyncProvider {
    private workbookId: string
    private userOrgId: string
    private pb: PocketBase
    private doc: Y.Doc
    private seq = 0
    private debounceTimer: ReturnType<typeof setTimeout> | null = null
    private pendingUpdate: Uint8Array | null = null
    private unsubscribe: (() => void) | null = null
    private destroyed = false

    onSynced?: () => void

    constructor({ workbookId, userOrgId, pb, doc }: PBSyncProviderOptions) {
        this.workbookId = workbookId
        this.userOrgId = userOrgId
        this.pb = pb
        this.doc = doc
    }

    async connect() {
        await this.loadInitialState()
        this.subscribeToUpdates()
        this.doc.on('update', this.handleLocalUpdate)
    }

    destroy() {
        this.destroyed = true
        this.doc.off('update', this.handleLocalUpdate)
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        if (this.unsubscribe) this.unsubscribe()
    }

    private async loadInitialState() {
        try {
            // Fetch latest snapshot
            const snapshots = await this.pb.collection('sheets_snapshots').getList(1, 1, {
                filter: `workbook = "${this.workbookId}"`,
                sort: '-created',
            })

            let snapshotUpdateCount = 0

            if (snapshots.items.length > 0) {
                const snapshot = snapshots.items[0]
                const stateBytes = base64ToUint8Array(snapshot.state)
                Y.applyUpdate(this.doc, stateBytes, 'remote')
                snapshotUpdateCount = snapshot.update_count
            }

            // Fetch updates after the snapshot
            const updates = await this.pb.collection('sheets_updates').getFullList({
                filter: `workbook = "${this.workbookId}" && seq > ${snapshotUpdateCount}`,
                sort: 'seq',
            })

            for (const update of updates) {
                const updateBytes = base64ToUint8Array(update.data)
                Y.applyUpdate(this.doc, updateBytes, 'remote')
                this.seq = Math.max(this.seq, update.seq)
            }

            this.onSynced?.()
        } catch (err) {
            captureException('Failed to load initial Yjs state:', err)
        }
    }

    private subscribeToUpdates() {
        this.pb.collection('sheets_updates').subscribe('*', e => {
            if (this.destroyed) return
            if (e.action !== 'create') return
            if (e.record.workbook !== this.workbookId) return
            // Skip our own updates
            if (e.record.user_org === this.userOrgId) return

            try {
                const updateBytes = base64ToUint8Array(e.record.data)
                Y.applyUpdate(this.doc, updateBytes, 'remote')
                this.seq = Math.max(this.seq, e.record.seq)
            } catch (err) {
                captureException('Failed to apply remote Yjs update:', err)
            }
        })

        this.unsubscribe = () => {
            this.pb.collection('sheets_updates').unsubscribe('*')
        }
    }

    private handleLocalUpdate = (update: Uint8Array, origin: string) => {
        if (origin === 'remote' || this.destroyed) return

        // Merge pending updates
        if (this.pendingUpdate) {
            this.pendingUpdate = Y.mergeUpdates([this.pendingUpdate, update])
        } else {
            this.pendingUpdate = update
        }

        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => this.flushUpdate(), DEBOUNCE_MS)
    }

    private async flushUpdate() {
        if (!this.pendingUpdate || this.destroyed) return

        const update = this.pendingUpdate
        this.pendingUpdate = null
        this.seq++

        try {
            await this.pb.collection('sheets_updates').create({
                workbook: this.workbookId,
                data: uint8ArrayToBase64(update),
                user_org: this.userOrgId,
                seq: this.seq,
            })

            // Compact if we've accumulated enough updates
            if (this.seq > 0 && this.seq % COMPACT_THRESHOLD === 0) {
                this.compact()
            }
        } catch (err) {
            captureException('Failed to push Yjs update:', err)
            // Re-queue the update
            if (this.pendingUpdate) {
                this.pendingUpdate = Y.mergeUpdates([update, this.pendingUpdate])
            } else {
                this.pendingUpdate = update
            }
        }
    }

    private async compact() {
        try {
            const state = Y.encodeStateAsUpdate(this.doc)
            await this.pb.collection('sheets_snapshots').create({
                workbook: this.workbookId,
                state: uint8ArrayToBase64(state),
                update_count: this.seq,
            })
            // biome-ignore lint/suspicious/noConsole: debug logging for compaction
            console.debug(`Compacted workbook ${this.workbookId} at seq ${this.seq}`)
        } catch (err) {
            captureException('Failed to compact Yjs state:', err)
        }
    }
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

export function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}
