import { describe, expect, it } from 'vitest'
import { decideShareRoute, workspaceHref } from '~/tinycld/drive/lib/share-routing'

// A signed-in member opening a share link to a file they already have access
// to should land in the workspace, not on the anonymous public preview. That
// redirect was permanently unreachable: it gated on an `org_slug` the server
// stopped sending during the single-org migration, and the ShareSession type
// declared it non-optional so nothing type-errored. The target was a dead
// `/a/<org>/` route besides.

describe('decideShareRoute', () => {
    const base = { isInitializing: false, isLoggedIn: true, data: { item_id: 'itm1' } }

    it('sends a signed-in member to the workspace with the preview open', () => {
        expect(decideShareRoute({ ...base, role: 'member' })).toEqual({
            kind: 'redirect',
            href: '/a/drive?file=itm1&preview=1',
        })
    })

    it('sends an authed visitor with no share row to the workspace too', () => {
        // 'unknown' = authed but no drive_shares row. The workspace's own rules
        // decide what they can see; the share route would show them less.
        expect(decideShareRoute({ ...base, role: 'unknown' })).toEqual({
            kind: 'redirect',
            href: '/a/drive?file=itm1&preview=1',
        })
    })

    it('keeps a guest on the share route', () => {
        // A guest is provisioned by OTP for THIS link only. The workspace
        // would 403 them everywhere else, so redirecting is worse than useless.
        expect(decideShareRoute({ ...base, role: 'guest' })).toEqual({ kind: 'share' })
    })

    it('keeps an anonymous visitor on the share route', () => {
        expect(decideShareRoute({ ...base, isLoggedIn: false, role: 'anon' })).toEqual({
            kind: 'share',
        })
    })

    it('waits while auth or the visitor role is still resolving', () => {
        expect(decideShareRoute({ ...base, isInitializing: true, role: 'member' })).toEqual({
            kind: 'wait',
        })
        expect(decideShareRoute({ ...base, role: 'loading' })).toEqual({ kind: 'wait' })
    })

    it('waits rather than flashing the public preview at a member', () => {
        // Routing data still in flight. Rendering the anonymous view and then
        // yanking it away a moment later is the worse of the two options.
        expect(decideShareRoute({ ...base, role: 'member', data: undefined })).toEqual({
            kind: 'wait',
        })
    })
})

describe('workspaceHref', () => {
    it('targets the prefixed /a/drive route', () => {
        // `/a` is a CONSTANT app-route segment, not an interpolated org slug —
        // an empty interpolation ('/a//drive') was the original 404 bug.
        expect(workspaceHref('itm1')).toBe('/a/drive?file=itm1&preview=1')
        expect(workspaceHref('itm1')).not.toContain('//')
    })

    it('encodes the item id', () => {
        expect(workspaceHref('a b&c')).toBe('/a/drive?file=a%20b%26c&preview=1')
    })
})
