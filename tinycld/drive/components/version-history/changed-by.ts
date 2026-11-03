import type { VersionRow } from '../../hooks/useVersionHistory'
import type { ComparePlan } from '../../lib/compare-mode'
import { versionPeople } from './version-row-text'

type People = { userIds: string[]; shareNames: string[] }

// Each version records who edited since the version before it, so the
// people behind a compare are those on the versions inside its range:
//   - vs. previous: the selected version itself
//   - vs. current: the versions after the selected one (edits not yet in
//     any version are not known here)
//   - two versions: after the older one, up to and including the newer one
export function changedBy(versions: VersionRow[], plan: ComparePlan): People {
    const byId = new Map(versions.map(v => [v.id, v]))
    const shown = plan.previewId ? byId.get(plan.previewId) : undefined
    if (!shown || plan.compare === 'none') return { userIds: [], shareNames: [] }

    const inRange = rangeOf(plan, shown, byId)

    const oldestFirst = versions.filter(inRange).sort((a, b) => a.version_number - b.version_number)
    const userIds = new Set<string>()
    const shareNames = new Set<string>()
    for (const version of oldestFirst) {
        const people = versionPeople(version)
        for (const id of people.userIds) userIds.add(id)
        for (const name of people.shareNames) shareNames.add(name)
    }
    return { userIds: [...userIds], shareNames: [...shareNames] }
}

function rangeOf(
    plan: ComparePlan,
    shown: VersionRow,
    byId: Map<string, VersionRow>
): (v: VersionRow) => boolean {
    if (plan.compare === 'versions') {
        const from = byId.get(plan.fromId)?.version_number ?? 0
        return v => v.version_number > from && v.version_number <= shown.version_number
    }
    if (plan.compare === 'current') return v => v.version_number > shown.version_number
    return v => v.id === shown.id
}
