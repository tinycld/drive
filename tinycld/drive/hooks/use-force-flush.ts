import { useMutation } from '@tinycld/core/lib/mutations'
import { pb } from '@tinycld/core/lib/pocketbase'

export type ForceFlushInput = {
    /** The realtime room kind that owns the document — e.g. 'text', 'calc'. */
    roomKind: string
    /** The drive_items id whose live room should be flushed to durable storage. */
    itemId: string
}

// useForceFlush synchronously persists a document's live realtime state
// to its drive_items.file blob before a caller reads that blob. The
// realtime save coordinator otherwise only flushes on a debounce, so
// surfaces that copy the stored bytes — "Export as template", "Make a
// copy" — would otherwise capture state that trails the in-room edits by
// up to the debounce window.
//
// The endpoint is a no-op success when no room is open (the last flush
// already wrote the current state), so callers can always flush before
// copying without checking whether the document is currently being
// edited.
export function useForceFlush() {
    return useMutation({
        mutationFn: async ({ roomKind, itemId }: ForceFlushInput) => {
            await pb.send(
                `/api/realtime/${encodeURIComponent(roomKind)}/${encodeURIComponent(itemId)}/flush`,
                { method: 'POST' }
            )
        },
    })
}
