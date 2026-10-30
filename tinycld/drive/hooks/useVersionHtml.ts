import { useQuery } from '@tanstack/react-query'
import { pb } from '@tinycld/core/lib/pocketbase'
import { serverFetch } from '@tinycld/core/lib/server-fetch'
import type { CompareMode, ComparePlan } from '../lib/compare-mode'

const HTML_STALE_MS = 5 * 60 * 1000

const PATHS: Record<CompareMode, string> = {
    none: 'render',
    previous: 'diff',
    current: 'diff?against=current',
}

function pathFor(plan: ComparePlan): string {
    if (plan.compare === 'versions') return `diff?from=${encodeURIComponent(plan.fromId)}`
    return PATHS[plan.compare]
}

// Status lets the screen tell "no preview for this file type" (404) from a
// failed render.
export class VersionHtmlError extends Error {
    constructor(readonly status: number) {
        super(`version html: HTTP ${status}`)
    }
}

async function fetchVersionHtml(plan: ComparePlan): Promise<string> {
    const base = pb.baseURL.replace(/\/$/, '')
    const headers: Record<string, string> = { Accept: 'text/html' }
    if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`
    const response = await serverFetch(
        `${base}/api/drive/versions/${plan.previewId}/${pathFor(plan)}`,
        {
            method: 'GET',
            headers,
        }
    )
    if (!response.ok) throw new VersionHtmlError(response.status)
    return response.text()
}

// A version never changes, but URL-mode images in the HTML carry short-lived
// file tokens, so the HTML is fetched again after a few minutes. A compare
// with the current document is always fetched fresh: the document changes.
export function useVersionHtml(plan: ComparePlan) {
    const fromId = plan.compare === 'versions' ? plan.fromId : ''
    const { data, isLoading, error } = useQuery({
        queryKey: ['drive-version-html', plan.previewId, plan.compare, fromId],
        queryFn: () => fetchVersionHtml(plan),
        enabled: !!plan.previewId,
        staleTime: plan.compare === 'current' ? 0 : HTML_STALE_MS,
        retry: false,
    })
    const status = error instanceof VersionHtmlError ? error.status : undefined
    return { html: data, isLoading, error, isUnsupported: status === 404 }
}
