import type { SearchResponse, SearchResultItem } from '@tinycld/app-generated/drive-api'
import { useApiSearch } from '@tinycld/core/lib/use-api-search'
import { useMemo } from 'react'

export type DriveSearchResult = SearchResultItem

const extractResults = (response: unknown) => (response as SearchResponse).items
const extractTotal = (response: unknown) => (response as SearchResponse).total

export function useDriveSearch(query: string) {
    const buildQueryParams = useMemo(() => (q: string) => ({ q }), [])

    const options = useMemo(
        () => ({
            endpoint: '/api/drive/search',
            buildQueryParams,
            extractResults,
            extractTotal,
        }),
        [buildQueryParams]
    )

    return useApiSearch<DriveSearchResult>(query, options)
}
