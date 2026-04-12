import { Slot } from 'expo-router'
import { View } from 'react-native'
import { XStack, YStack } from 'tamagui'
import { useBreakpoint } from '~/components/workspace/useBreakpoint'
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
        selectItem,
        activeSection,
        uploadFiles,
        isUploading,
        previewItem,
        closePreview,
    } = useDrive()
    const isMobile = useBreakpoint() === 'mobile'
    const showDetail = !!selectedItem && !isMobile
    const isMyDrive = activeSection === 'my-drive'

    return (
        <YStack flex={1} backgroundColor="$background">
            <DriveToolbar />
            <XStack flex={1}>
                <View style={{ flex: 1 }}>
                    <DropZone onDrop={uploadFiles} isEnabled={isMyDrive}>
                        <Slot />
                    </DropZone>
                    <UploadStatusBar isVisible={isUploading} />
                </View>
                <DetailPanel
                    isVisible={showDetail}
                    item={selectedItem}
                    onClose={() => selectItem(null)}
                />
            </XStack>
            <PreviewModal isVisible={!!previewItem} item={previewItem} onClose={closePreview} />
            <DriveDialogs />
        </YStack>
    )
}
