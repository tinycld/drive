import { describe, expect, it } from 'vitest'
import { buildDriveHref, parseDrivePath } from '~/tinycld/drive/hooks/useDriveNavigation'

// Every in-app Drive href — sidebar sections, folder double-click, breadcrumbs —
// came from buildDriveHref, which still prefixed `/a/<orgSlug>`. The single-org
// migration deleted that route segment and made useOrgInfo return an empty
// slug, so every one of them resolved to `/a//drive/...` and landed on
// +not-found: Drive was unusable past its root screen. The sibling guard for
// share links lives in share-routing.test.ts.

describe('buildDriveHref', () => {
    it('never emits an org-prefixed path', () => {
        const hrefs = [
            buildDriveHref(),
            buildDriveHref({ section: 'my-drive' }),
            buildDriveHref({ section: 'starred' }),
            buildDriveHref({ section: 'trash' }),
            buildDriveHref({ section: 'recent' }),
            buildDriveHref({ section: 'shared-with-me' }),
            buildDriveHref({ folderId: 'fld1' }),
        ]
        for (const href of hrefs) {
            expect(href).not.toContain('/a/')
            expect(href).toMatch(/^\/drive/)
        }
    })

    it('builds the root, section and folder paths', () => {
        expect(buildDriveHref()).toBe('/drive')
        expect(buildDriveHref({ section: 'my-drive' })).toBe('/drive')
        expect(buildDriveHref({ section: 'starred' })).toBe('/drive/starred')
        expect(buildDriveHref({ folderId: 'fld1' })).toBe('/drive/folder/fld1')
    })

    // 'shared-with-me' is the internal section name; the URL segment is 'shared'.
    it('maps shared-with-me onto the /shared segment', () => {
        expect(buildDriveHref({ section: 'shared-with-me' })).toBe('/drive/shared')
    })

    // A folder id wins over a section: opening a folder from within Starred
    // navigates to the folder, not back to the section root.
    it('prefers the folder over the section', () => {
        expect(buildDriveHref({ section: 'starred', folderId: 'fld9' })).toBe('/drive/folder/fld9')
    })
})

// parseDrivePath is the inverse and must agree with what buildDriveHref emits,
// or the sidebar highlights a different section than the one being displayed.
describe('parseDrivePath round-trips buildDriveHref', () => {
    const cases: Array<{
        section: 'my-drive' | 'starred' | 'trash' | 'recent' | 'shared-with-me'
    }> = [
        { section: 'my-drive' },
        { section: 'starred' },
        { section: 'trash' },
        { section: 'recent' },
        { section: 'shared-with-me' },
    ]

    for (const { section } of cases) {
        it(`round-trips ${section}`, () => {
            const href = buildDriveHref({ section }) as string
            expect(parseDrivePath(href)).toEqual({ section, folderId: '' })
        })
    }

    it('round-trips a folder', () => {
        const href = buildDriveHref({ folderId: 'fld1' }) as string
        expect(parseDrivePath(href)).toEqual({ section: 'my-drive', folderId: 'fld1' })
    })
})
