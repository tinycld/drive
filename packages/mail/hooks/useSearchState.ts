import { createContext, useContext } from 'react'
import type { MailSearchResult } from './useMailSearch'

export interface SearchState {
    query: string
    results: MailSearchResult[]
    total: number
    isSearching: boolean
    isActive: boolean
}

export const SearchContext = createContext<SearchState>({
    query: '',
    results: [],
    total: 0,
    isSearching: false,
    isActive: false,
})

export function useMailSearchState() {
    return useContext(SearchContext)
}
