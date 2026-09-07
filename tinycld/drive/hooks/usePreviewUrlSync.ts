import { useUrlStateSync } from '@tinycld/core/lib/use-url-state-sync'
import { useLocalSearchParams } from 'expo-router'
import { useDriveUIStore } from '../stores/drive-ui-store'

/**
 * Bridge between the preview store flag and the browser URL.
 *
 * A shared link carries `?file=X&preview=1`, so opening it lands on the
 * preview; opening, closing or stepping through previews writes the same
 * params back so the address bar is always a link to what is on screen.
 *
 * The mechanism — each direction firing only on its own side changing — is
 * core's useUrlStateSync; this used to be a one-shot hydrator plus a mirror
 * effect that avoided looping only because the hydrator ran once, which also
 * meant a back/forward that changed `?file=` was ignored.
 *
 * `setParams` is a shallow params update that does not remount the route (so
 * <Slot/> stays put) and works on native, where the URL bar is invisible but
 * the navigation state still tracks.
 */
export function usePreviewUrlSync(): void {
    const params = useLocalSearchParams<{ file?: string; preview?: string }>()
    const file = paramString(params.file)
    const preview = paramString(params.preview)

    useUrlStateSync<string | null>({
        isReady: true,
        urlValue: preview === '1' && file ? file : null,
        params: { file, preview },
        format: itemId => ({ file: itemId ?? undefined, preview: itemId ? '1' : undefined }),
        read: readPreviewItem,
        write: itemId => {
            const store = useDriveUIStore.getState()
            if (itemId) store.openPreviewItem(itemId)
            else store.closePreviewItem()
        },
        subscribe: useDriveUIStore.subscribe,
    })
}

function readPreviewItem(): string | null {
    return useDriveUIStore.getState().previewItemId
}

/** A route param as one string: expo-router types repeated params as arrays. */
function paramString(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? ''
    return value ?? ''
}
