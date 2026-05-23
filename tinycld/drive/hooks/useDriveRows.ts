import { useMemo } from 'react'
import type { DriveItemView, SortDirection, SortField } from '../types'

// List mode is a flat sequence of items; the column header is a sibling
// of the FlashList, not a row. Each list row carries its own absolute
// index so even-row striping / position-aware tooltips work without
// needing the row builder to know about virtualization.
export type ListRow = { kind: 'item'; item: DriveItemView; index: number }

// Grid mode prepends a section label per non-empty bucket. Section
// labels span the full row via overrideItemLayout({ span: numColumns }).
// Folders and files are rendered as separate cards with their own
// recycle pools (driven by getItemType).
export type GridRow =
    | { kind: 'section'; title: 'Folders' | 'Files' }
    | { kind: 'card'; item: DriveItemView }

export interface BuildListRowsParams {
    folders: DriveItemView[]
    files: DriveItemView[]
    sortField: SortField
    sortDirection: SortDirection
}

export interface BuildGridRowsParams {
    folders: DriveItemView[]
    files: DriveItemView[]
}

// Case-insensitive, natural ("file2" before "file10") string ordering.
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

// Compares two items by a single field. Timestamps are ISO strings, which
// sort lexicographically; empty strings (no owner / not-yet-deleted) sort
// last in ascending order so blanks don't crowd the top.
function compareByField(a: DriveItemView, b: DriveItemView, field: SortField): number {
    switch (field) {
        case 'size':
            return a.size - b.size
        case 'name':
        case 'owner':
            return collator.compare(a[field], b[field])
        case 'updated':
        case 'trashedAt': {
            const av = a[field]
            const bv = b[field]
            if (!av && !bv) return 0
            if (!av) return 1
            if (!bv) return -1
            return av < bv ? -1 : av > bv ? 1 : 0
        }
    }
}

// Sorts a flat group of items by the chosen field/direction. Pure: returns a
// new array, never mutates the input. Ties fall back to name (asc) so the
// order is stable and deterministic across renders.
export function sortDriveItems(
    items: DriveItemView[],
    field: SortField,
    direction: SortDirection
): DriveItemView[] {
    const dir = direction === 'desc' ? -1 : 1
    return [...items].sort((a, b) => {
        const primary = compareByField(a, b, field)
        if (primary !== 0) return primary * dir
        return collator.compare(a.name, b.name)
    })
}

export function buildListRows({
    folders,
    files,
    sortField,
    sortDirection,
}: BuildListRowsParams): ListRow[] {
    // Uploading placeholders are optimistic rows appended to `files`; pin them
    // to the end of the file group (in arrival order) so an in-progress upload
    // never jumps around as the sort key changes.
    const realFiles = files.filter(f => !f.uploadStatus)
    const uploading = files.filter(f => f.uploadStatus)

    const sortedFolders = sortDriveItems(folders, sortField, sortDirection)
    const sortedFiles = sortDriveItems(realFiles, sortField, sortDirection)

    const rows: ListRow[] = []
    let i = 0
    for (const folder of sortedFolders) rows.push({ kind: 'item', item: folder, index: i++ })
    for (const file of sortedFiles) rows.push({ kind: 'item', item: file, index: i++ })
    for (const file of uploading) rows.push({ kind: 'item', item: file, index: i++ })
    return rows
}

export function buildGridRows({ folders, files }: BuildGridRowsParams): GridRow[] {
    const rows: GridRow[] = []
    if (folders.length > 0) {
        rows.push({ kind: 'section', title: 'Folders' })
        for (const folder of folders) rows.push({ kind: 'card', item: folder })
    }
    if (files.length > 0) {
        rows.push({ kind: 'section', title: 'Files' })
        for (const file of files) rows.push({ kind: 'card', item: file })
    }
    return rows
}

export function useListRows(params: BuildListRowsParams): ListRow[] {
    return useMemo(
        () => buildListRows(params),
        [params.folders, params.files, params.sortField, params.sortDirection, params]
    )
}

export function useGridRows(params: BuildGridRowsParams): GridRow[] {
    return useMemo(() => buildGridRows(params), [params.folders, params.files, params])
}
