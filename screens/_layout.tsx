import { Slot } from 'expo-router'
import { View } from 'react-native'
import { useBreakpoint } from '~/components/workspace/useBreakpoint'
import { useThemeColor } from '~/lib/use-app-theme'
import { DetailPanel } from '../components/DetailPanel'
import { DriveDialogs, DriveToolbar } from '../components/DriveToolbar'
import { DropZone } from '../components/DropZone'
import { PreviewModal } from '../components/PreviewModal'
import { UploadStatusBar } from '../components/UploadStatusBar'
import { useDrive } from '../hooks/useDrive'
import '../lib/register-previews'
import DriveProvider from '../provider'

export default function DriveLayout() {
    return (
        <DriveProvider>
            <DriveLayoutInner />
        </DriveProvider>
    )
}

function DriveLayoutInner() {
    const {
        selectedItem,
        activeSection,
        uploadFiles,
        uploadTree,
        isUploading,
        previewItem,
        closePreview,
        detailPanelOpen,
        closeDetailPanel,
    } = useDrive()
    const bgColor = useThemeColor('background')
    const isMobile = useBreakpoint() === 'mobile'
    const showDetail = detailPanelOpen && !!selectedItem && !isMobile
    const isMyDrive = activeSection === 'my-drive'

    return (
        <View className="flex-1" style={{ backgroundColor: bgColor }}>
            <DriveToolbar />
            <View className="flex-1 flex-row">
                <View className="flex-1">
                    <DropZone onDrop={uploadFiles} onDropTree={uploadTree} isEnabled={isMyDrive}>
                        <Slot />
                    </DropZone>
                    <UploadStatusBar isVisible={isUploading} />
                </View>
                <DetailPanel
                    isVisible={showDetail}
                    item={selectedItem}
                    onClose={closeDetailPanel}
                />
            </View>
            <PreviewModal isVisible={!!previewItem} item={previewItem} onClose={closePreview} />
            <DriveDialogs />
        </View>
    )
}
