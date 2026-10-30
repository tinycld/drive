import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { appHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { versionRowText } from '../components/version-history/version-row-text'
import { type CompareMode, comparePlan, parseCompareMode } from '../lib/compare-mode'
import { groupVersionsByDay } from '../lib/version-groups'
import { useCanWriteItem } from './useCanWriteItem'
import { useVersionHistory } from './useVersionHistory'

function leaveHistory() {
    if (router.canGoBack()) {
        router.back()
    } else {
        router.replace(appHref('drive'))
    }
}

export function useVersionHistoryScreen(itemId: string) {
    const [driveItemsCollection] = useStore('drive_items')
    const { record: item } = useRecord(driveItemsCollection, itemId)
    const history = useVersionHistory(itemId)
    const canWrite = useCanWriteItem(itemId, item?.created_by)
    const { v, compare, base } = useLocalSearchParams<{
        v?: string
        compare?: string
        base?: string
    }>()
    const compareMode = parseCompareMode(compare)
    const isPhone = useBreakpoint() === 'mobile'
    const [isRestoreOpen, setRestoreOpen] = useState(false)
    const [isRenameOpen, setRenameOpen] = useState(false)

    const selected = history.versions.find(row => row.id === v) ?? history.versions[0]
    const groups = groupVersionsByDay(history.versions, new Date())
    const baseVersion = history.versions.find(row => row.id === base)
    const plan = comparePlan(selected, baseVersion, compareMode)
    const baseTitle =
        plan.compare === 'versions' && baseVersion ? versionRowText(baseVersion).title : ''

    const confirmRestore = () => {
        setRestoreOpen(false)
        if (selected) history.restoreVersion(selected.id, { onSuccess: leaveHistory })
    }
    const submitRename = (label: string) => {
        setRenameOpen(false)
        if (selected) history.renameVersion(selected.id, label)
    }

    return {
        itemName: item?.name ?? '',
        mimeType: item?.mime_type ?? '',
        groups,
        selected,
        hasVersions: history.versions.length > 0,
        // On a phone the list and the preview are separate screens; the
        // `v` param says which one is showing.
        isPhone,
        isListVisible: !isPhone || !v,
        isPreviewVisible: !isPhone || !!v,
        // Restore and Rename need write access; viewers only look. They sit
        // on the active version's row; on a phone the list is hidden while
        // a version is open, so there they are in the preview's toolbar.
        isToolbarActionsVisible: canWrite && isPhone && !!v && !!selected,
        rowActions: {
            isEnabled: canWrite && !isPhone,
            isRestoring: history.isRestoring,
            onRename: () => setRenameOpen(true),
            onRestore: () => setRestoreOpen(true),
        },
        // Selecting the base version itself ends the two-version compare.
        select: (versionId: string) =>
            router.setParams(
                versionId === base ? { v: versionId, base: undefined } : { v: versionId }
            ),
        // ⌘/Ctrl-click or long-press: this version becomes the base the
        // selected one is compared with; picking the base again clears it.
        pickBase: (versionId: string) =>
            router.setParams(
                versionId === base ? { base: undefined } : { base: versionId, compare: undefined }
            ),
        clearBase: () => router.setParams({ base: undefined }),
        baseId: baseVersion?.id,
        baseTitle,
        plan,
        compareMode,
        setCompareMode: (mode: CompareMode) =>
            router.setParams({ compare: mode === 'none' ? undefined : mode, base: undefined }),
        // Viewers may compare; only Restore and Rename need write access.
        isCompareVisible: (!isPhone || !!v) && !!selected,
        // Back from a phone preview returns to the list; otherwise it leaves.
        back: isPhone && v ? () => router.setParams({ v: undefined }) : leaveHistory,
        isRestoring: history.isRestoring,
        isRestoreOpen,
        openRestore: () => setRestoreOpen(true),
        closeRestore: () => setRestoreOpen(false),
        confirmRestore,
        isRenameOpen,
        openRename: () => setRenameOpen(true),
        closeRename: () => setRenameOpen(false),
        submitRename,
    }
}
