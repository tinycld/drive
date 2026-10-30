// What the version history preview shows: the version itself, its changes
// from the version before it, or the changes from it to the current document.
export type CompareMode = 'none' | 'previous' | 'current'

export function parseCompareMode(value: string | undefined): CompareMode {
    return value === 'previous' || value === 'current' ? value : 'none'
}
