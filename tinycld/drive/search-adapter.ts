import { useOrgHref } from '@tinycld/core/lib/org-routes'
import type { SearchRow } from '@tinycld/core/lib/search/types'
import { useRouter } from 'expo-router'

// Row shaping (title, subtitle, meta) is the server's job — see drive's search
// source in drive/server. Normalizing there rather than here means the palette
// and the CLI render identical rows from one implementation; a TypeScript
// version could only ever serve the browser.
//
// What remains client-side is selection, which needs the router.

export function useSearchActions() {
    const router = useRouter()
    const orgHref = useOrgHref()
    return {
        onSelect: (row: SearchRow) => {
            // `file` + `preview: '1'` is the URL contract usePreviewUrlSync
            // (useDrive.tsx) hydrates from on mount to open the preview
            // modal — there is no `item` param consumer anywhere in drive,
            // so pushing `{ item: row.id }` navigated to the plain Drive
            // root and never revealed the selected file.
            router.push(orgHref('drive', { file: row.id, preview: '1' }))
        },
    }
}
