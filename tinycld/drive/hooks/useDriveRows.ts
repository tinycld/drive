import { useMemo } from 'react'
import type { DriveItemView, ViewMode } from '../types'

// Each row in the virtualized drive listing is one of these. Headers and
// section labels span the full row in grid mode (via overrideItemLayout);
// list-item / grid-item cells take one column. Splitting list-item and
// grid-item into separate kinds (rather than threading viewMode through a
// shared kind) lets FlashList recycle them in separate pools — list rows
// and grid cards have very different DOM shapes.
export type RowData =
    | { kind: 'list-header' }
    | { kind: 'section-label'; title: 'Folders' | 'Files' }
    | { kind: 'list-item'; item: DriveItemView; index: number }
    | { kind: 'grid-item'; item: DriveItemView }

export interface BuildRowsParams {
    folders: DriveItemView[]
    files: DriveItemView[]
    viewMode: ViewMode
    isMobile: boolean
}

export function buildDriveRows({ folders, files, viewMode, isMobile }: BuildRowsParams): RowData[] {
    const rows: RowData[] = []
    if (viewMode === 'list') {
        // Mobile list view skips the column header (the row layout omits the
        // column legend, see FilesListRowImpl's mobile branch in
        // screens/index.tsx).
        if (!isMobile) rows.push({ kind: 'list-header' })
        let i = 0
        for (const folder of folders) rows.push({ kind: 'list-item', item: folder, index: i++ })
        for (const file of files) rows.push({ kind: 'list-item', item: file, index: i++ })
        return rows
    }
    // grid mode
    if (folders.length > 0) {
        rows.push({ kind: 'section-label', title: 'Folders' })
        for (const folder of folders) rows.push({ kind: 'grid-item', item: folder })
    }
    if (files.length > 0) {
        rows.push({ kind: 'section-label', title: 'Files' })
        for (const file of files) rows.push({ kind: 'grid-item', item: file })
    }
    return rows
}

export function useDriveRows(params: BuildRowsParams): RowData[] {
    return useMemo(
        () => buildDriveRows(params),
        // Listing each field individually lets the memo bail when an unrelated
        // re-render happens (e.g. context change).
        [params.folders, params.files, params.viewMode, params.isMobile]
    )
}
