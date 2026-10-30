import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { appHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { type CompareMode, parseCompareMode } from '../lib/compare-mode'
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
    const { v, compare } = useLocalSearchParams<{ v?: string; compare?: string }>()
    const compareMode = parseCompareMode(compare)
    const isPhone = useBreakpoint() === 'mobile'
    const [isRestoreOpen, setRestoreOpen] = useState(false)
    const [isRenameOpen, setRenameOpen] = useState(false)

    const selected = history.versions.find(row => row.id === v) ?? history.versions[0]
    const groups = groupVersionsByDay(history.versions, new Date())

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
        // Restore and Rename need write access; viewers only look.
        isActionsVisible: canWrite && (!isPhone || !!v) && !!selected,
        select: (versionId: string) => router.setParams({ v: versionId }),
        compareMode,
        setCompareMode: (mode: CompareMode) =>
            router.setParams({ compare: mode === 'none' ? undefined : mode }),
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
