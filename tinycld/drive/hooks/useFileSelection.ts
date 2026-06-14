import { useCallback } from 'react'
import { type GestureResponderEvent, Platform } from 'react-native'
import {
    clickAction,
    pressDownAction,
    type SelectionAction,
    type SelectionModifiers,
} from '../lib/selection-gesture'
import { useDriveUIStore } from '../stores/drive-ui-store'

function modifiersOf(event: GestureResponderEvent): SelectionModifiers {
    const native = event.nativeEvent as unknown as MouseEvent
    return { meta: native.metaKey, ctrl: native.ctrlKey, shift: native.shiftKey }
}

export function useFileSelection(orderedItemIds: string[]) {
    const selectSingle = useDriveUIStore(s => s.selectSingle)
    const selectToggle = useDriveUIStore(s => s.selectToggle)
    const selectRange = useDriveUIStore(s => s.selectRange)
    const selectItem = useDriveUIStore(s => s.selectItem)
    const selectedIds = useDriveUIStore(s => s.selectedIds)

    const dispatch = useCallback(
        (action: SelectionAction, itemId: string) => {
            switch (action.type) {
                case 'none':
                    return
                case 'single':
                    selectSingle(itemId)
                    selectItem(itemId)
                    return
                case 'toggle':
                    selectToggle(itemId)
                    // The resulting set size isn't known here, so clear the
                    // detail-panel item; the panel reads selectedIds itself.
                    selectItem(null)
                    return
                case 'range':
                    selectRange(itemId, orderedItemIds)
                    selectItem(null)
            }
        },
        [orderedItemIds, selectSingle, selectToggle, selectRange, selectItem]
    )

    // Press-DOWN (onPressIn) — instant highlight. Preserves an existing
    // multi-selection on a plain press so a grab can drag the whole set; the
    // collapse-to-one is deferred to handleSelectClick. See selection-gesture.ts.
    const handleSelect = useCallback(
        (itemId: string, event: GestureResponderEvent) => {
            if (Platform.OS !== 'web') {
                selectSingle(itemId)
                selectItem(itemId)
                return
            }
            dispatch(pressDownAction(itemId, modifiersOf(event), selectedIds), itemId)
        },
        [dispatch, selectSingle, selectItem, selectedIds]
    )

    // Release/CLICK (onPress) — collapses a preserved multi-selection to the one
    // clicked item, but only on a real click (a drag consumes the pointer, so
    // this never fires after one). No-op on native.
    const handleSelectClick = useCallback(
        (itemId: string, event: GestureResponderEvent) => {
            if (Platform.OS !== 'web') return
            dispatch(clickAction(itemId, modifiersOf(event), selectedIds), itemId)
        },
        [dispatch, selectedIds]
    )

    const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

    return { handleSelect, handleSelectClick, isSelected, selectedIds }
}
