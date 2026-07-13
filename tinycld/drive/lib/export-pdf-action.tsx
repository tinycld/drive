import { registerPreviewAction } from '@tinycld/core/file-viewer/preview-action-registry'
import { FileText } from 'lucide-react-native'
import { canExportToPdf, exportItemToPdf } from './export-pdf'

/**
 * Side-effect module: registers "Export to PDF" against core's PreviewModal
 * toolbar (PreviewAction). Drive's provider imports it once at app boot.
 *
 * The preview toolbar is a flat row of icon buttons — it can't host the full
 * "Download as ▸" submenu (that lives in the drive row context menu, rendered
 * directly in DriveContextMenu). So the toolbar offers just the single most
 * common target, PDF. The conversion is server-side (doctaculous); the server
 * independently re-checks convertibility.
 */
registerPreviewAction('drive.exportPdf', () => ({
    id: 'drive.exportPdf',
    icon: FileText,
    label: 'Export to PDF',
    isApplicable: source => canExportToPdf(source.mimeType),
    onPress: source => {
        exportItemToPdf(source.recordId, source.displayName)
    },
}))
