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
            router.push(orgHref('drive', { item: row.id }))
        },
    }
}
