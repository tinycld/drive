import { downloadFromUrl } from '@tinycld/core/file-viewer/file-url'
import { captureException } from '@tinycld/core/lib/errors'
import { notify } from '@tinycld/core/lib/notify'
import { pb } from '@tinycld/core/lib/pocketbase'

// A server-side "Download as" target: the doctaculous format id sent as `to`,
// the menu label, and the MIME hint used for the platform download path.
export interface ExportTarget {
    to: string
    label: string
    mime: string
    ext: string
}

// Curated targets by source family. Only conversions that make sense are
// offered — the server independently re-checks convertibility, so a bad entry
// fails safe with a clear error rather than a broken download. Same-format
// (e.g. docx→docx) is intentionally omitted; "Download" already serves the
// original bytes.
const PDF: ExportTarget = { to: 'pdf', label: 'PDF', mime: 'application/pdf', ext: 'pdf' }
const HTML: ExportTarget = { to: 'html', label: 'Web page (HTML)', mime: 'text/html', ext: 'html' }
const RTF: ExportTarget = {
    to: 'rtf',
    label: 'Rich text (RTF)',
    mime: 'application/rtf',
    ext: 'rtf',
}
const TXT: ExportTarget = {
    to: 'text',
    label: 'Plain text (TXT)',
    mime: 'text/plain',
    ext: 'txt',
}
const MD: ExportTarget = {
    to: 'markdown',
    label: 'Markdown (MD)',
    mime: 'text/markdown',
    ext: 'md',
}
const DOCX: ExportTarget = {
    to: 'docx',
    label: 'Word (DOCX)',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
}
const CSV: ExportTarget = { to: 'csv', label: 'CSV', mime: 'text/csv', ext: 'csv' }

// Exported so calc can drive current-sheet vs all-sheets CSV via the optional
// `sheet` param, rather than re-declaring the target.
export const CSV_TARGET = CSV

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

// Source MIME → the targets we offer for it. A word-processing source can go to
// PDF/HTML/RTF/TXT/MD; a spreadsheet to PDF/CSV/HTML; slides & ebooks to PDF.
const TARGETS_BY_SOURCE: Record<string, ExportTarget[]> = {
    [DOCX_MIME]: [PDF, HTML, RTF, TXT, MD],
    'application/rtf': [PDF, HTML, DOCX, TXT, MD],
    'text/rtf': [PDF, HTML, DOCX, TXT, MD],
    'text/html': [PDF, DOCX, RTF, TXT, MD],
    'text/markdown': [PDF, HTML, DOCX, RTF, TXT],
    'text/x-markdown': [PDF, HTML, DOCX, RTF, TXT],
    'text/plain': [PDF, HTML, DOCX, RTF, MD],
    [XLSX_MIME]: [PDF, CSV, HTML],
    'text/csv': [PDF, HTML],
    [PPTX_MIME]: [PDF],
    'application/epub+zip': [PDF, HTML, TXT],
}

/** The "Download as" targets for a file of this MIME type (empty if none). */
export function exportTargetsFor(mimeType: string): ExportTarget[] {
    return TARGETS_BY_SOURCE[normalizeMime(mimeType)] ?? []
}

/** Reports whether any "Download as" target exists for this MIME type. */
export function canExport(mimeType: string): boolean {
    return exportTargetsFor(mimeType).length > 0
}

/**
 * Convert a drive item to `target` on the server and download it. Mirrors the
 * folder-download flow: an authed POST mints a single-use token, then
 * downloadFromUrl streams the tokened URL (a browser anchor-download can't
 * carry the bearer header, so the token in the URL is the credential).
 * Fire-and-forget: callers don't await.
 */
export function exportItemToFormat(
    itemId: string,
    displayName: string,
    target: ExportTarget,
    opts?: { sheet?: string }
) {
    void (async () => {
        try {
            const response = await pb.send('/api/drive/export-token', {
                method: 'POST',
                body: { item: itemId, to: target.to, sheet: opts?.sheet ?? '' },
            })
            const fileName = `${stripExtension(displayName)}.${target.ext}`
            downloadFromUrl(`${pb.baseURL}${response.url}`, fileName, target.mime)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            captureException('drive.exportItemToFormat', err, { itemId, to: target.to })
            notify.emit({
                event: 'mutation.error',
                title: `Could not export to ${target.label}`,
                body: message,
                data: { operation: 'exportItemToFormat', error: message },
            })
        }
    })()
}

/** Convenience: export a drive item to PDF (the most common target). */
export function exportItemToPdf(itemId: string, displayName: string) {
    exportItemToFormat(itemId, displayName, PDF)
}

/** Reports whether a file of this MIME type can be exported to PDF. */
export function canExportToPdf(mimeType: string): boolean {
    return exportTargetsFor(mimeType).some(t => t.to === 'pdf')
}

function normalizeMime(mimeType: string): string {
    return mimeType.split(';')[0].trim().toLowerCase()
}

function stripExtension(name: string): string {
    const i = name.lastIndexOf('.')
    return i > 0 ? name.slice(0, i) : name
}
