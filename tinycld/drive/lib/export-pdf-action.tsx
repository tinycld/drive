import { registerPreviewAction } from '@tinycld/core/file-viewer/preview-action-registry'
import { FileText } from 'lucide-react-native'
import { canExportToPdf, exportItemToPdf } from './export-pdf'
import { registerDriveItemAction } from './item-actions-registry'

/**
 * Side-effect module: registers "Export to PDF" against BOTH the drive row
 * context menu (DriveItemAction) and core's PreviewModal toolbar
 * (PreviewAction). Drive's provider imports it once at app boot.
 *
 * The conversion is server-side (doctaculous), so this works for any document
 * format the server can lay out — docx, xlsx, pptx, epub, rtf, html, markdown,
 * csv, plain text — but not for files that are already PDF or are images.
 * canExportToPdf gates visibility; the server independently re-checks.
 *
 * Same `id` across both registries by convention (see item-actions-registry)
 * so the two surfaces correlate.
 */
registerDriveItemAction('drive.exportPdf', () => ({
    id: 'drive.exportPdf',
    icon: FileText,
    label: 'Export to PDF',
    isApplicable: item => !item.isFolder && !!item.file && canExportToPdf(item.mimeType),
    onPress: item => {
        exportItemToPdf(item.id, item.name)
    },
}))

registerPreviewAction('drive.exportPdf', () => ({
    id: 'drive.exportPdf',
    icon: FileText,
    label: 'Export to PDF',
    isApplicable: source => canExportToPdf(source.mimeType),
    onPress: source => {
        exportItemToPdf(source.recordId, source.displayName)
    },
}))
