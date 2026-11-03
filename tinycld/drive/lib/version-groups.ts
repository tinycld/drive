const DAY_MS = 24 * 60 * 60 * 1000

function localDayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function dayLabel(date: Date, now: Date): string {
    const key = localDayKey(date)
    if (key === localDayKey(now)) return 'Today'
    if (key === localDayKey(new Date(now.getTime() - DAY_MS))) return 'Yesterday'
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

// Input is newest first; groups keep that order.
export function groupVersionsByDay<T extends { created: string }>(versions: T[], now: Date) {
    const groups: { dayKey: string; label: string; versions: T[] }[] = []
    for (const version of versions) {
        const date = new Date(version.created)
        const dayKey = localDayKey(date)
        const last = groups.at(-1)
        if (last?.dayKey === dayKey) {
            last.versions.push(version)
        } else {
            groups.push({ dayKey, label: dayLabel(date, now), versions: [version] })
        }
    }
    return groups
}
