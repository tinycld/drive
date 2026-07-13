import { downloadFromUrl } from '@tinycld/core/file-viewer/file-url'
import { captureException } from '@tinycld/core/lib/errors'
import { notify } from '@tinycld/core/lib/notify'
import { pb } from '@tinycld/core/lib/pocketbase'

/**
 * MIME types the server can convert to PDF (doctaculous's document frontends,
 * minus PDF itself and images). Kept in sync with the server's mimeFormats
 * map in drive/server/format detection: a type absent here shows no "Export to
 * PDF" affordance, and the server independently re-checks convertibility, so a
 * stale entry fails safe with a clear error rather than a broken download.
 */
const EXPORTABLE_TO_PDF = new Set([
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

/** Reports whether a file of this MIME type can be exported to PDF. */
export function canExportToPdf(mimeType: string): boolean {
    return EXPORTABLE_TO_PDF.has(mimeType.split(';')[0].trim().toLowerCase())
}

/**
 * Convert a drive item to PDF on the server and download it. Mirrors the
 * folder-download flow: an authed POST mints a single-use token, then
 * downloadFromUrl streams the tokened URL (a browser anchor-download can't
 * carry the bearer header, so the token in the URL is the credential).
 * Fire-and-forget: callers don't await.
 */
export function exportItemToPdf(itemId: string, displayName: string) {
    void (async () => {
        try {
            const response = await pb.send('/api/drive/export-token', {
                method: 'POST',
                body: { item: itemId, to: 'pdf' },
            })
            const fileName = `${stripExtension(displayName)}.pdf`
            downloadFromUrl(`${pb.baseURL}${response.url}`, fileName, 'application/pdf')
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            captureException('drive.exportItemToPdf', err, { itemId })
            notify.emit({
                event: 'mutation.error',
                title: 'Could not export to PDF',
                body: message,
                data: { operation: 'exportItemToPdf', error: message },
            })
        }
    })()
}

function stripExtension(name: string): string {
    const i = name.lastIndexOf('.')
    return i > 0 ? name.slice(0, i) : name
}
