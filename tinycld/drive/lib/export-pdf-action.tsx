import { registerPreviewAction } from '@tinycld/core/file-viewer/preview-action-registry'
import { FileText, Shapes } from 'lucide-react-native'
import { canExport, exportItem } from './export-pdf'
import { registerDriveItemAction } from './item-actions-registry'

/**
 * Side-effect module: registers "Export to PDF" and "Export to SVG" against
 * BOTH the drive row context menu (DriveItemAction) and core's PreviewModal
 * toolbar (PreviewAction). Drive's provider imports it once at app boot.
 *
 * The conversion is server-side (omnidoc), so this works for any document
 * format the server can lay out — docx, xlsx, pptx, epub, rtf, html, markdown,
 * csv, plain text — but not for images. A PDF has no PDF export (it is already
 * one) but does have an SVG export. canExport gates visibility per target; the
 * server independently re-checks.
 *
 * SVG exports the first page only: one SVG file has no notion of pagination.
 *
 * Same `id` across both registries by convention (see item-actions-registry)
 * so the two surfaces correlate.
 */
registerDriveItemAction('drive.exportPdf', () => ({
    id: 'drive.exportPdf',
    icon: FileText,
    label: 'Export to PDF',
    isApplicable: item => !item.isFolder && !!item.file && canExport(item.mimeType, 'pdf'),
    onPress: item => {
        exportItem(item.id, item.name, 'pdf')
    },
}))

registerDriveItemAction('drive.exportSvg', () => ({
    id: 'drive.exportSvg',
    icon: Shapes,
    label: 'Export to SVG',
    isApplicable: item => !item.isFolder && !!item.file && canExport(item.mimeType, 'svg'),
    onPress: item => {
        exportItem(item.id, item.name, 'svg')
    },
}))

registerPreviewAction('drive.exportPdf', () => ({
    id: 'drive.exportPdf',
    icon: FileText,
    label: 'Export to PDF',
    isApplicable: source => canExport(source.mimeType, 'pdf'),
    onPress: source => {
        exportItem(source.recordId, source.displayName, 'pdf')
    },
}))

registerPreviewAction('drive.exportSvg', () => ({
    id: 'drive.exportSvg',
    icon: Shapes,
    label: 'Export to SVG',
    isApplicable: source => canExport(source.mimeType, 'svg'),
    onPress: source => {
        exportItem(source.recordId, source.displayName, 'svg')
    },
}))
