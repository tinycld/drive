import { Platform } from 'react-native'
import { getFileURL } from '../../lib/file-url'
import type { PreviewProps } from '../../lib/preview-registry'
import { PdfCanvasViewer } from '../PdfCanvasViewer'
import { GenericPreview } from './GenericPreview'

export function PdfPreview(props: PreviewProps) {
    const { item } = props
    const fileUrl = getFileURL(item)

    if (!fileUrl) return null
    if (Platform.OS !== 'web') return <GenericPreview {...props} />

    return <PdfCanvasViewer url={fileUrl} />
}
