import { useOrgHref } from '@tinycld/core/lib/org-routes'
import type { SearchRow } from '@tinycld/core/lib/search/types'
import { useRouter } from 'expo-router'

interface DriveSearchHit {
    id: string
    name: string
    description: string
}

export function toRow(hit: unknown): Omit<SearchRow, 'slug'> | null {
    const item = hit as DriveSearchHit
    return {
        id: item.id,
        title: item.name || 'Untitled file',
        subtitle: item.description || undefined,
        meta: undefined,
    }
}

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
