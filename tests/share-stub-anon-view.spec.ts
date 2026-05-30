import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { createShareLink, revokeShareLink, uploadFileAsDriveItem } from './helpers'

// Drive — anon viewer flow against the @tinycld/share-stub package.
//
// What this replaces:
//   share-link-view3.spec.ts (deleted). That spec mounted real calc/text
//   editors and asserted on ProseMirror / calc workbook surfaces, which
//   are owned by @tinycld/{text,calc}. When those packages' UI changed,
//   drive's CI went red over bugs that didn't live in drive. The stub
//   package registers a share editor for `application/x-tinycld-stub`
//   that renders the mount object's fields as data-test-ids; drive's
//   spec asserts on its OWN contract (route resolves → mount built with
//   right role/identity/capabilities → registered editor receives mount).
//
// What this does NOT replace (covered by text's / calc's own e2e):
//   - "write attempt on calc/text: typing doesn't insert characters."
//     The stub has no editable surface; that's a real-editor concern.
//   - "server-side block: owner reload shows file unchanged." Same —
//     belongs in the package whose editor would attempt the write.
//
// The 60-req/min/IP public-share rate limiter is shared across contexts
// against 127.0.0.1 (the dev proxy loopback) when XFF isn't set. The
// existing spec pinned a unique RFC-1918 IP per context to route each
// test through its own counter; we keep that pattern here.

const STUB_MIME = 'application/x-tinycld-stub'
const TEST_TIMEOUT = 90_000
const VISIBILITY_TIMEOUT = 30_000

test.describe.configure({ mode: 'serial' })

function uniqueXffIp(): string {
    const a = Math.floor(Math.random() * 254) + 1
    const b = Math.floor(Math.random() * 254) + 1
    const c = Math.floor(Math.random() * 254) + 1
    return `10.${a}.${b}.${c}`
}

async function pinXffOnContext(ctx: BrowserContext, ip: string): Promise<void> {
    await ctx.route('**/api/**', async route => {
        const headers = { ...route.request().headers(), 'x-forwarded-for': ip }
        await route.continue({ headers })
    })
}

async function uploadStubFixture(name: string): Promise<{ id: string; name: string }> {
    const path = join(tmpdir(), `${name}.stub`)
    writeFileSync(path, 'stub-fixture-bytes')
    const { id } = await uploadFileAsDriveItem({
        fixturePath: path,
        name: `${name}.stub`,
        mimeType: STUB_MIME,
    })
    return { id, name: `${name}.stub` }
}

async function openAnonShareLink(
    browser: import('@playwright/test').Browser,
    token: string
): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext()
    await pinXffOnContext(context, uniqueXffIp())
    const page = await context.newPage()
    await page.goto(`/share/${token}`)
    return { context, page }
}

// Reads the anon displayName the stub editor rendered. Subtitle on the
// share route header still shows the session displayName ("viewing as
// Anon Witty Cheetah"), but the stub's mount.identity.displayName is
// the canonical source — it's what the share route handed the editor.
async function readStubDisplayName(page: Page): Promise<string> {
    const text = await page
        .locator('[data-test-id="stub-identity-displayName"]')
        .first()
        .innerText()
    const match = text.match(/identity\.displayName:\s*(.+)$/)
    if (!match) throw new Error(`Unexpected stub displayName text: ${text}`)
    return match[1].trim()
}

test.describe('Drive — anon viewer share link (stub)', () => {
    let fixture: { itemId: string; name: string; token: string; linkId: string }

    test('setup: upload .stub fixture and mint viewer share link', async () => {
        test.setTimeout(TEST_TIMEOUT)
        const doc = await uploadStubFixture(`stub-view-${Date.now()}`)
        const link = await createShareLink({ itemId: doc.id, role: 'viewer' })
        fixture = { itemId: doc.id, name: doc.name, token: link.token, linkId: link.id }
        expect(fixture.token).toMatch(/^[0-9a-f]{64}$/)
    })

    test('mount: viewer share link renders the stub editor for an anon visitor', async ({
        browser,
    }) => {
        test.setTimeout(TEST_TIMEOUT)
        const { context, page } = await openAnonShareLink(browser, fixture.token)
        try {
            // "Stub share editor" — unambiguous "real editor mounted, NOT
            // the static PublicShareLayout fallback" marker.
            await expect(page.getByText('Stub share editor')).toBeVisible({
                timeout: VISIBILITY_TIMEOUT,
            })
            // The mount the share route built must match an anon viewer:
            //   identity.kind == 'anon', role == 'viewer', no edit/comment.
            await expect(page.locator('[data-test-id="stub-role"]')).toContainText('role: viewer')
            await expect(page.locator('[data-test-id="stub-identity-kind"]')).toContainText(
                'identity.kind: anon'
            )
            await expect(page.locator('[data-test-id="stub-cap-canEdit"]')).toContainText(
                'canEdit: false'
            )
            await expect(page.locator('[data-test-id="stub-cap-canComment"]')).toContainText(
                'canComment: false'
            )
            // Item name flows through the mount, proving the share-session
            // resolved the right drive_item for this token.
            await expect(page.locator('[data-test-id="stub-item-name"]')).toContainText(
                fixture.name
            )
        } finally {
            await context.close()
        }
    })

    test('identity persistence: reloading the same context yields the same anon displayName', async ({
        browser,
    }) => {
        test.setTimeout(TEST_TIMEOUT)
        const context = await browser.newContext()
        await pinXffOnContext(context, uniqueXffIp())
        try {
            const page = await context.newPage()
            await page.goto(`/share/${fixture.token}`)
            await expect(page.getByText('Stub share editor')).toBeVisible({
                timeout: VISIBILITY_TIMEOUT,
            })
            const first = await readStubDisplayName(page)

            // anon_id persists in the context's AsyncStorage (writeAnonId
            // in core/lib/anon-identity.ts). A reload re-mints the same
            // session — same anon_id → same hashed displayName.
            await page.reload()
            await expect(page.getByText('Stub share editor')).toBeVisible({
                timeout: VISIBILITY_TIMEOUT,
            })
            const second = await readStubDisplayName(page)

            expect(second).toBe(first)
            // Sanity-check we got a real Anon name, not an empty/placeholder.
            expect(first).toMatch(/^Anon \w+/)
        } finally {
            await context.close()
        }
    })

    test('revoke: revoked share link renders the "Link expired" UI', async ({ browser }) => {
        test.setTimeout(TEST_TIMEOUT)
        // Mint a fresh link so the suite-level fixture stays usable for
        // any later test in this file that depends on it.
        const oneShot = await createShareLink({ itemId: fixture.itemId, role: 'viewer' })
        await revokeShareLink(oneShot.id)

        const context = await browser.newContext()
        await pinXffOnContext(context, uniqueXffIp())
        try {
            const page = await context.newPage()
            await page.goto(`/share/${oneShot.token}`)
            // Expired UI is owned by core's PublicShareLayout — drive's
            // share route falls back to it when the session mint fails
            // (revoked link returns 410). This is the negative-path
            // assertion the stub can't carry; we check core's surface.
            await expect(page.getByText('Link expired', { exact: true })).toBeVisible({
                timeout: VISIBILITY_TIMEOUT,
            })
            // And the stub editor must NOT mount for an expired link.
            await expect(page.getByText('Stub share editor')).not.toBeVisible()
        } finally {
            await context.close()
        }
    })
})
