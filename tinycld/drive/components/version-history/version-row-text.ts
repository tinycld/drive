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

// The people a row names: who edited since the previous version for an
// automatic one, who saved or uploaded it otherwise.
export function versionPeople(version: VersionRow) {
    const userIds = version.source === 'auto' ? version.editors : [version.created_by]
    return { userIds: userIds.filter(Boolean), shareNames: shareEditorNames(version.share_editors) }
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
