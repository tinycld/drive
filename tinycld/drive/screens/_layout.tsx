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
    // The detail panel sits beside the listing on a desktop and is a
    // right-anchored drawer over it on narrower screens — on a phone "Info"
    // opens the same drawer the web shows (see useDetailPanelPresentation).
    const showDetail = detailPanelOpen && !!selectedItem
    const isMyDrive = activeSection === 'my-drive'

    return (
        <View className="flex-1 bg-background">
            <DriveItemActionsHost />
            <DriveToolbar />
            {/* A row, so an inline detail panel takes its place beside the
                listing; an overlay panel renders outside it. */}
            <View className="flex-1 flex-row">
                <View className="flex-1">
                    <DropZone onDrop={uploadFiles} onDropTree={uploadTree} isEnabled={isMyDrive}>
                        <FrozenSlideStack />
                    </DropZone>
                    <UploadStatusBar />
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
