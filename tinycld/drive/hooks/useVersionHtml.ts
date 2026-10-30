import { useQuery } from '@tanstack/react-query'
import { pb } from '@tinycld/core/lib/pocketbase'
import { serverFetch } from '@tinycld/core/lib/server-fetch'

const HTML_STALE_MS = 5 * 60 * 1000

type VersionHtmlArgs = {
    versionId: string | undefined
    mode: 'render' | 'diff'
    fromId?: string
}

// Status lets the screen tell "no preview for this file type" (404) from a
// failed render.
export class VersionHtmlError extends Error {
    constructor(readonly status: number) {
        super(`version html: HTTP ${status}`)
    }
}

async function fetchVersionHtml({ versionId, mode, fromId }: VersionHtmlArgs): Promise<string> {
    const base = pb.baseURL.replace(/\/$/, '')
    const query = mode === 'diff' && fromId ? `?from=${encodeURIComponent(fromId)}` : ''
    const headers: Record<string, string> = { Accept: 'text/html' }
    if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`
    const response = await serverFetch(`${base}/api/drive/versions/${versionId}/${mode}${query}`, {
        method: 'GET',
        headers,
    })
    if (!response.ok) throw new VersionHtmlError(response.status)
    return response.text()
}

// A version never changes, but URL-mode images in the HTML carry short-lived
// file tokens, so the HTML is fetched again after a few minutes.
export function useVersionHtml(args: VersionHtmlArgs) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['drive-version-html', args.versionId, args.mode, args.fromId ?? ''],
        queryFn: () => fetchVersionHtml(args),
        enabled: !!args.versionId,
        staleTime: HTML_STALE_MS,
        retry: false,
    })
    const status = error instanceof VersionHtmlError ? error.status : undefined
    return { html: data, isLoading, error, isUnsupported: status === 404 }
}
