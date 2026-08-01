import { describe, expect, it } from 'vitest'
import manifest from '../manifest'

describe('drive manifest', () => {
    it('declares required identifiers', () => {
        expect(manifest.name).toBe('Drive')
        expect(manifest.slug).toBe('drive')
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/)
    })

    it('points routes directory at screens', () => {
        expect(manifest.routes?.directory).toBe('screens')
    })

    it('declares public routes for the share page', () => {
        expect(manifest.publicRoutes?.directory).toBe('public-screens')
    })

    it('declares migrations, collections, and seed', () => {
        expect(manifest.migrations?.directory).toBe('pb-migrations')
        expect(manifest.collections?.register).toBe('collections')
        expect(manifest.collections?.types).toBe('types')
        expect(manifest.seed?.script).toBe('seed')
    })

    it('declares a nav entry', () => {
        expect(manifest.nav?.label).toBe('Drive')
        expect(manifest.nav?.icon).toBe('hard-drive')
        expect(typeof manifest.nav?.order).toBe('number')
    })

    it('declares a server module', () => {
        expect(manifest.server?.package).toBe('server')
        expect(manifest.server?.module).toBe('tinycld.org/packages/drive')
    })
})

// The WebDAV mount and the in-app route must not occupy the same path.
//
// They did. WebDAV was mounted at /drive and the SPA route is also /drive, and
// a literal server route beats the SPA catch-all — so a hard navigation
// (reload, pasted link, bookmark) to /drive, /drive/recent or /drive/<path>
// reached the Basic-Auth WebDAV handler and produced a browser credential
// prompt instead of the app. Only in-app SPA clicks worked, which is why every
// existing e2e passed: they navigate by click and never hard-load the route.
//
// The collision was created by the single-org migration. The old in-app path
// was /a/<orgSlug>/drive, which never overlapped.
describe('drive WebDAV prefix', () => {
    it('does not shadow the in-app /drive route', () => {
        const prefix = manifest.webdav?.prefix
        expect(prefix).toBeDefined()
        expect(prefix).not.toBe('/drive')
        // Nor may it be a prefix OF the app route, which would swallow
        // /drive/* the same way.
        expect('/drive'.startsWith(`${prefix}/`)).toBe(false)
    })

    it('mounts under the reserved /dav namespace', () => {
        // /dav is reserved for protocol mounts, so no package slug can ever
        // claim it and re-create this collision.
        expect(manifest.webdav?.prefix).toBe('/dav/drive')
    })
})
