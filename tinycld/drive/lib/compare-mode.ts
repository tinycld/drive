// What the version history preview shows: the version itself, its changes
// from the version before it, or the changes from it to the current document.
export type CompareMode = 'none' | 'previous' | 'current'

export function parseCompareMode(value: string | undefined): CompareMode {
    return value === 'previous' || value === 'current' ? value : 'none'
}

// The request behind the preview. With a picked base version (⌘/Ctrl-click
// or long-press), the newer of the two is shown with the changes from the
// older one, whichever was picked first.
export type ComparePlan =
    | { previewId: string | undefined; compare: CompareMode }
    | { previewId: string; compare: 'versions'; fromId: string }

type Picked = { id: string; version_number: number }

export function comparePlan(
    selected: Picked | undefined,
    base: Picked | undefined,
    mode: CompareMode
): ComparePlan {
    if (!selected || !base || base.id === selected.id) {
        return { previewId: selected?.id, compare: mode }
    }
    const [older, newer] =
        base.version_number < selected.version_number ? [base, selected] : [selected, base]
    return { previewId: newer.id, compare: 'versions', fromId: older.id }
}
