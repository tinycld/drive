import { describe, expect, it } from 'vitest'
import { changedBy } from '~/tinycld/drive/components/version-history/changed-by'

type Row = Parameters<typeof changedBy>[0][number]

function row(
    id: string,
    n: number,
    source: string,
    createdBy: string,
    editors: string[],
    share: string[] = []
): Row {
    return {
        id,
        version_number: n,
        source,
        created_by: createdBy,
        editors,
        share_editors: share,
    } as Row
}

// Newest first, as the history list holds them.
const versions = [
    row('v4', 4, 'auto', 'owner', ['dana']),
    row('v3', 3, 'user', 'carol', ['bob'], ['Anon Otter']),
    row('v2', 2, 'auto', 'owner', ['alice']),
    row('v1', 1, 'upload', 'owner', []),
]

describe('changedBy', () => {
    it('vs. previous: the people on the selected version', () => {
        expect(changedBy(versions, { previewId: 'v3', compare: 'previous' })).toEqual({
            userIds: ['carol', 'bob'],
            shareNames: ['Anon Otter'],
        })
    })

    it('vs. current: everyone on the versions after the selected one', () => {
        expect(changedBy(versions, { previewId: 'v2', compare: 'current' })).toEqual({
            userIds: ['carol', 'bob', 'dana'],
            shareNames: ['Anon Otter'],
        })
    })

    it('two versions: everyone after the older, up to and including the newer', () => {
        expect(changedBy(versions, { previewId: 'v4', compare: 'versions', fromId: 'v2' })).toEqual(
            {
                userIds: ['carol', 'bob', 'dana'],
                shareNames: ['Anon Otter'],
            }
        )
    })

    it('no compare: nobody', () => {
        expect(changedBy(versions, { previewId: 'v3', compare: 'none' })).toEqual({
            userIds: [],
            shareNames: [],
        })
    })
})
