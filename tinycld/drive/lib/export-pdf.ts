import type { ExportTokenRequest, TokenResponse } from '@tinycld/app-generated/drive-api'
import { downloadFromUrl } from '@tinycld/core/file-viewer/file-url'
import { captureException } from '@tinycld/core/lib/errors'
import { notify } from '@tinycld/core/lib/notify'
import { pb } from '@tinycld/core/lib/pocketbase'

/** Formats the server accepts as an export target. */
export type ExportFormat = 'pdf' | 'svg'

/**
 * MIME types the server can convert (omnidoc's document frontends, minus
 * images). Kept in sync with the server's mimeFormats map in drive/server
 * format detection: a type absent here shows no export affordance, and the
 * server independently re-checks convertibility, so a stale entry fails safe
 * with a clear error rather than a broken download.
 */
const EXPORTABLE = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    'application/epub+zip',
    'application/rtf',
    'text/rtf',
    'text/html',
    'application/xhtml+xml',
    'text/markdown',
    'text/x-markdown',
    'text/csv',
    'application/csv',
    'text/tab-separated-values',
    'text/plain',
])

/**
 * Reports whether a file of this MIME type can be exported to `to`.
 *
 * A PDF is refused as a PDF target (converting it to itself is a no-op) but is
 * a valid SVG source, so the same-format exclusion is per-target.
 */
export function canExport(mimeType: string, to: ExportFormat = 'pdf'): boolean {
    const mime = mimeType.split(';')[0].trim().toLowerCase()
    if (mime === 'application/pdf') return to !== 'pdf'
    return EXPORTABLE.has(mime)
}

const EXPORT_MIME: Record<ExportFormat, string> = {
    pdf: 'application/pdf',
    svg: 'image/svg+xml',
}

/**
 * Convert a drive item on the server and download it. Mirrors the
 * folder-download flow: an authed POST mints a single-use token, then
 * downloadFromUrl streams the tokened URL (a browser anchor-download can't
 * carry the bearer header, so the token in the URL is the credential).
 * Fire-and-forget: callers don't await.
 *
 * An SVG export renders the first page only — one SVG file has no pagination.
 */
export function exportItem(itemId: string, displayName: string, to: ExportFormat = 'pdf') {
    const label = to.toUpperCase()
    void (async () => {
        try {
            const response: TokenResponse = await pb.send('/api/drive/export-token', {
                method: 'POST',
                body: { item: itemId, to } satisfies ExportTokenRequest,
            })
            const fileName = `${stripExtension(displayName)}.${to}`
            downloadFromUrl(`${pb.baseURL}${response.url}`, fileName, EXPORT_MIME[to])
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            captureException('drive.exportItem', err, { itemId, to })
            notify.emit({
                event: 'mutation.error',
                title: `Could not export to ${label}`,
                body: message,
                data: { operation: 'exportItem', error: message },
            })
        }
    })()
}

function stripExtension(name: string): string {
    const i = name.lastIndexOf('.')
    return i > 0 ? name.slice(0, i) : name
}
