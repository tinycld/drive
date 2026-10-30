import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'
import { PromptDialog } from '@tinycld/core/ui/PromptDialog'
import { View } from 'react-native'
import { useVersionHistoryScreen } from '../../hooks/useVersionHistoryScreen'
import type { ComparePlan } from '../../lib/compare-mode'
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
                isActionsVisible={screen.isToolbarActionsVisible}
                isRestoring={screen.isRestoring}
                isCompareVisible={screen.isCompareVisible}
                compareMode={screen.compareMode}
                onCompareModeChange={screen.setCompareMode}
                baseTitle={screen.baseTitle}
                onClearBase={screen.clearBase}
            />
            <View className="flex-1 flex-row">
                <PreviewPane
                    isVisible={screen.isPreviewVisible}
                    plan={screen.plan}
                    itemName={screen.itemName}
                    mimeType={screen.mimeType}
                />
                <VersionList
                    isVisible={screen.isListVisible}
                    groups={screen.groups}
                    selectedId={screen.selected?.id}
                    baseId={screen.baseId}
                    rowActions={screen.rowActions}
                    onSelect={screen.select}
                    onPickBase={screen.pickBase}
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
    plan,
    itemName,
    mimeType,
}: {
    isVisible: boolean
    plan: ComparePlan
    itemName: string
    mimeType: string
}) {
    if (!isVisible) return null
    return (
        <View className="flex-1">
            <VersionPreview plan={plan} itemName={itemName} mimeType={mimeType} />
        </View>
    )
}
