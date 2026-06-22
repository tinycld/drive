import { and, eq } from '@tanstack/db'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'
import { useMemo } from 'react'
import { isTemplateName, TEMPLATE_EXTENSIONS, type TemplateExtension } from '../lib/template-naming'

// The drive mime types that back each template extension. The live query
// filters on mime server-side (drive_items syncs on-demand, so the
// filter must be expressible as a PocketBase predicate); the `.tmpl.*`
// suffix is then narrowed client-side, since there's no suffix operator
// in the tanstack→PB filter translation.
const MIME_BY_EXTENSION: Record<TemplateExtension, string> = {
    [TEMPLATE_EXTENSIONS.docx]:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    [TEMPLATE_EXTENSIONS.xlsx]: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

// The fields the template picker needs from each row. Deliberately
// narrower than DriveItemView — the picker doesn't care about shares,
// starred state, or trash, so we skip the enrichment joins useDriveItems
// does and read the raw drive_items columns directly.
export interface TemplateItem {
    id: string
    name: string
    file: string
    thumbnail: string
    updated: string
    size: number
}

interface TemplateRow {
    id: string
    name: string
    file: string
    thumbnail?: string
    updated: string
    size?: number
}

// filterTemplateItems narrows a set of mime-matched rows to those whose
// name follows the template convention for the given extension. Pure and
// exported so it can be unit-tested without a live store — the `~` /
// substring traps (e.g. `report.tmpl.docx.bak`) are exactly what this
// guards against.
export function filterTemplateItems(
    rows: readonly TemplateRow[],
    templateExt: TemplateExtension
): TemplateItem[] {
    return rows
        .filter(row => isTemplateName(row.name, templateExt))
        .map(row => ({
            id: row.id,
            name: row.name,
            file: row.file,
            thumbnail: row.thumbnail ?? '',
            updated: row.updated,
            size: row.size ?? 0,
        }))
}

// useTemplateItems lists the org's template files for one extension,
// newest-updated first. Mirrors useTextDocuments' query shape (org +
// mime + non-folder, ordered by updated) and adds the client-side
// `.tmpl.*` suffix narrowing.
export function useTemplateItems(extension: TemplateExtension) {
    const [driveItemsCollection] = useStore('drive_items')
    const mime = MIME_BY_EXTENSION[extension]

    const { data, isLoading } = useOrgLiveQuery(
        (query, { orgId }) =>
            query
                .from({ item: driveItemsCollection })
                .where(({ item }) =>
                    and(eq(item.org, orgId), eq(item.mime_type, mime), eq(item.is_folder, false))
                )
                .orderBy(({ item }) => item.updated, 'desc'),
        [mime]
    )

    const items = useMemo(
        () => filterTemplateItems((data ?? []) as TemplateRow[], extension),
        [data, extension]
    )

    return { items, isLoading }
}

// computeHasTemplates is the gate predicate, split out so it can be unit
// tested without a hook harness. Returns false while the query is still
// loading so the entry point doesn't flicker in and then vanish — it only
// shows once we've confirmed at least one template exists.
export function computeHasTemplates(itemCount: number, isLoading: boolean): boolean {
    return !isLoading && itemCount > 0
}

// useHasTemplates is a thin gate over useTemplateItems for surfaces that
// only need a yes/no — the index "From template…" trigger and the File
// menu item, which are hidden entirely when the org has no templates for
// the extension.
export function useHasTemplates(extension: TemplateExtension): boolean {
    const { items, isLoading } = useTemplateItems(extension)
    return computeHasTemplates(items.length, isLoading)
}
