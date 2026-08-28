import { describe, expect, it } from 'vitest'
import { buildDriveHref, parseDrivePath } from '~/tinycld/drive/hooks/useDriveNavigation'

// Every in-app Drive href — sidebar sections, folder double-click, breadcrumbs —
// comes from buildDriveHref. It once interpolated an org slug that the
// single-org migration emptied, so every href resolved to `/a//drive/...` and
// landed on +not-found: Drive was unusable past its root screen. App routes now
// sit under a CONSTANT `/a` segment (nothing interpolates into it), so the guard
// below pins the shape rather than banning the prefix. The sibling guard for
// share links lives in share-routing.test.ts.

describe('buildDriveHref', () => {
    it('emits exactly one prefix segment and no empty segment', () => {
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
            expect(href).toMatch(/^\/a\/drive/)
            // An empty interpolated segment ('//') is the original bug.
            expect(href).not.toContain('//')
        }
    })

    it('builds the root, section and folder paths', () => {
        expect(buildDriveHref()).toBe('/a/drive')
        expect(buildDriveHref({ section: 'my-drive' })).toBe('/a/drive')
        expect(buildDriveHref({ section: 'starred' })).toBe('/a/drive/starred')
        expect(buildDriveHref({ folderId: 'fld1' })).toBe('/a/drive/folder/fld1')
    })

    // 'shared-with-me' is the internal section name; the URL segment is 'shared'.
    it('maps shared-with-me onto the /shared segment', () => {
        expect(buildDriveHref({ section: 'shared-with-me' })).toBe('/a/drive/shared')
    })

    // A folder id wins over a section: opening a folder from within Starred
    // navigates to the folder, not back to the section root.
    it('prefers the folder over the section', () => {
        expect(buildDriveHref({ section: 'starred', folderId: 'fld9' })).toBe(
            '/a/drive/folder/fld9'
        )
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
