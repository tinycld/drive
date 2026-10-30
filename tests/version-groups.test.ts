import { describe, expect, it } from 'vitest'
import { groupVersionsByDay } from '~/tinycld/drive/lib/version-groups'

describe('groupVersionsByDay', () => {
    const now = new Date(2026, 9, 30, 15, 0)

    it('groups newest-first rows by local day with Today/Yesterday labels', () => {
        const rows = [
            { id: 'a', created: new Date(2026, 9, 30, 14, 0).toISOString() },
            { id: 'b', created: new Date(2026, 9, 30, 9, 0).toISOString() },
            { id: 'c', created: new Date(2026, 9, 29, 20, 0).toISOString() },
            { id: 'd', created: new Date(2026, 9, 1, 10, 0).toISOString() },
        ]
        const groups = groupVersionsByDay(rows, now)
        expect(groups.map(g => g.versions.map(v => v.id))).toEqual([['a', 'b'], ['c'], ['d']])
        expect(groups[0].label).toBe('Today')
        expect(groups[1].label).toBe('Yesterday')
        expect(groups[2].label).not.toBe('Yesterday')
    })

    it('returns no groups for no rows', () => {
        expect(groupVersionsByDay([], now)).toEqual([])
    })
})
