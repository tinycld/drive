import { FrozenSlideStack } from '@tinycld/core/components/workspace/FrozenStack'
import { View } from 'react-native'
import { DetailPanel } from '../components/DetailPanel'
import { DriveDialogs, DriveToolbar } from '../components/DriveToolbar'
import { DropZone } from '../components/DropZone'
import { PreviewModal } from '../components/PreviewModal'
import { UploadStatusBar } from '../components/UploadStatusBar'
import { DriveStateProvider, useDrive } from '../hooks/useDrive'
import { DriveItemActionsHost } from '../hooks/useDriveItemActions'
import DriveProvider from '../provider'

export default function DriveLayout() {
    return (
        <DriveProvider>
            <DriveStateProvider>
                <DriveLayoutInner />
            </DriveStateProvider>
        </DriveProvider>
    )
}

function DriveLayoutInner() {
    const {
        selectedItem,
        activeSection,
        uploadFiles,
        uploadTree,
        previewItem,
        closePreview,
        detailPanelOpen,
        closeDetailPanel,
    } = useDrive()
    // The detail panel renders as a right-anchored Drawer (~80% width,
    // full-height) that works on every breakpoint, so it isn't gated to
    // desktop/tablet — on a phone "Info" opens the same drawer the web shows.
    const showDetail = detailPanelOpen && !!selectedItem
    const isMyDrive = activeSection === 'my-drive'

    return (
        <View className="flex-1 bg-background">
            <DriveItemActionsHost />
            <DriveToolbar />
            <View className="flex-1">
                <DropZone onDrop={uploadFiles} onDropTree={uploadTree} isEnabled={isMyDrive}>
                    <FrozenSlideStack />
                </DropZone>
                <UploadStatusBar />
            </View>
            <DetailPanel isVisible={showDetail} item={selectedItem} onClose={closeDetailPanel} />
            <PreviewModal isVisible={!!previewItem} item={previewItem} onClose={closePreview} />
            <DriveDialogs />
        </View>
    )
}
