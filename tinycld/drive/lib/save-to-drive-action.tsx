import { registerPreviewAction } from '@tinycld/core/file-viewer/preview-action-registry'
import { Save } from 'lucide-react-native'
import { useSaveToDrive } from './save-to-drive'

/**
 * Side-effect module: importing this file registers a "Save to Drive" entry
 * with core's PreviewModal action registry. Drive's provider imports it once
 * at app boot so any preview surface (mail, future packages) automatically
 * gets the action button when @tinycld/drive is linked.
 */
registerPreviewAction('drive.save', () => {
    const mutation = useSaveToDrive()
    return {
        id: 'drive.save',
        icon: Save,
        label: 'Save to Drive',
        isPending: mutation.isPending,
        onPress: (source) => {
            mutation.mutate(source)
        },
    }
})
