import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'
import { PromptDialog } from '@tinycld/core/ui/PromptDialog'
import { View } from 'react-native'
import { useVersionHistoryScreen } from '../../hooks/useVersionHistoryScreen'
import type { CompareMode } from '../../lib/compare-mode'
import { VersionList } from './VersionList'
import { VersionPreview } from './VersionPreview'
import { VersionToolbar } from './VersionToolbar'

// Full-screen version history for any drive item. Preview and compare come
// from the item type's server hooks; a type without them still gets the
// list, rename and restore.
export function VersionHistoryScreen({ itemId }: { itemId: string }) {
    const screen = useVersionHistoryScreen(itemId)
    const listClass = screen.isPhone ? 'flex-1' : 'w-80 border-l border-border'

    return (
        <View className="flex-1 bg-background">
            <VersionToolbar
                title={screen.itemName}
                onBack={screen.back}
                onRename={screen.openRename}
                onRestore={screen.openRestore}
                isActionsVisible={screen.isActionsVisible}
                isRestoring={screen.isRestoring}
                isCompareVisible={screen.isCompareVisible}
                compareMode={screen.compareMode}
                onCompareModeChange={screen.setCompareMode}
            />
            <View className="flex-1 flex-row">
                <PreviewPane
                    isVisible={screen.isPreviewVisible}
                    versionId={screen.selected?.id}
                    itemName={screen.itemName}
                    mimeType={screen.mimeType}
                    compareMode={screen.compareMode}
                />
                <VersionList
                    isVisible={screen.isListVisible}
                    groups={screen.groups}
                    selectedId={screen.selected?.id}
                    onSelect={screen.select}
                    className={listClass}
                />
            </View>
            <ConfirmDialog
                isOpen={screen.isRestoreOpen}
                onClose={screen.closeRestore}
                onConfirm={screen.confirmRestore}
                title="Restore this version?"
                message="The current state is kept in the version history."
                confirmLabel="Restore"
                isSubmitting={screen.isRestoring}
            />
            <PromptDialog
                isOpen={screen.isRenameOpen}
                onClose={screen.closeRename}
                onSubmit={screen.submitRename}
                title="Rename version"
                description="A labeled version is kept forever. Leave it empty to remove the label."
                placeholder="Version name"
                defaultValue={screen.selected?.label ?? ''}
                confirmLabel="Save"
                maxLength={500}
                required={false}
            />
        </View>
    )
}

function PreviewPane({
    isVisible,
    versionId,
    itemName,
    mimeType,
    compareMode,
}: {
    isVisible: boolean
    versionId: string | undefined
    itemName: string
    mimeType: string
    compareMode: CompareMode
}) {
    if (!isVisible) return null
    return (
        <View className="flex-1">
            <VersionPreview
                versionId={versionId}
                itemName={itemName}
                mimeType={mimeType}
                compareMode={compareMode}
            />
        </View>
    )
}
