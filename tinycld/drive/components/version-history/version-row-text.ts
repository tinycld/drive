import type { VersionRow } from '../../hooks/useVersionHistory'

const SOURCE_BADGES: Record<string, string> = {
    auto: 'Auto',
    user: 'Saved',
    upload: 'Upload',
}

function shareEditorNames(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((name): name is string => typeof name === 'string')
}

// The people a row names: who saved or uploaded it, and who edited since
// the version before it (retention also moves the editors of thinned
// versions here). An automatic version's created_by is the file owner, not
// an editor, so it is left out.
export function versionPeople(version: VersionRow) {
    const ids =
        version.source === 'auto' ? version.editors : [version.created_by, ...version.editors]
    return {
        userIds: [...new Set(ids.filter(Boolean))],
        shareNames: shareEditorNames(version.share_editors),
    }
}

export function versionRowText(version: VersionRow) {
    const time = new Date(version.created).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    })
    return {
        title: version.label || time,
        time,
        badge: SOURCE_BADGES[version.source] ?? '',
    }
}
