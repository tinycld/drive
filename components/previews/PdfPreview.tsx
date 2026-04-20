import { lazy, Suspense } from 'react'
import { ActivityIndicator, Platform } from 'react-native'
import { getFileURL } from '../../lib/file-url'
import type { PreviewProps } from '../../lib/preview-registry'
import { GenericPreview } from './GenericPreview'

const PdfCanvasViewer = lazy(() => import('../PdfCanvasViewer').then((m) => ({ default: m.PdfCanvasViewer })))

export function PdfPreview(props: PreviewProps) {
    const { item } = props
    const fileUrl = getFileURL(item)

    if (!fileUrl) return null
    if (Platform.OS !== 'web') return <GenericPreview {...props} />

    return (
        <Suspense fallback={<ActivityIndicator />}>
            <PdfCanvasViewer url={fileUrl} />
        </Suspense>
    )
}
