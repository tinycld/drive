import { useCallback, useEffect, useRef, useState } from 'react'
import { pb } from '~/lib/pocketbase'

export interface MailSearchResult {
    thread_id: string
    subject: string
    subject_highlight: string
    snippet_highlight: string
    latest_date: string
    participants: string
    message_count: number
    mailbox_id: string
}

interface MailSearchResponse {
    items: MailSearchResult[]
    total: number
}

interface UseMailSearchReturn {
    results: MailSearchResult[]
    total: number
    isSearching: boolean
    error: string | null
}

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === 'AbortError'
}

function toErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : 'Search failed'
}

export function useMailSearch(query: string): UseMailSearchReturn {
    const [results, setResults] = useState<MailSearchResult[]>([])
    const [total, setTotal] = useState(0)
    const [isSearching, setIsSearching] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const abortRef = useRef<AbortController | null>(null)

    const search = useCallback(async (q: string) => {
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setIsSearching(true)
        setError(null)

        try {
            const response: MailSearchResponse = await pb.send('/api/mail/search', {
                method: 'GET',
                query: { q },
                signal: controller.signal,
            })
            if (!controller.signal.aborted) {
                setResults(response.items)
                setTotal(response.total)
            }
        } catch (err: unknown) {
            if (isAbortError(err)) return
            if (!controller.signal.aborted) {
                setError(toErrorMessage(err))
                setResults([])
                setTotal(0)
            }
        } finally {
            if (!controller.signal.aborted) {
                setIsSearching(false)
            }
        }
    }, [])

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current)

        if (query.length < MIN_QUERY_LENGTH) {
            setResults([])
            setTotal(0)
            setIsSearching(false)
            setError(null)
            abortRef.current?.abort()
            return
        }

        timerRef.current = setTimeout(() => search(query), DEBOUNCE_MS)

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [query, search])

    useEffect(() => {
        return () => {
            abortRef.current?.abort()
        }
    }, [])

    return { results, total, isSearching, error }
}
