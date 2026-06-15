import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import {
    authTokenForTestUser,
    createShareLink,
    revokeShareLink,
    shareStubInstalled,
    uploadFileAsDriveItem,
} from './helpers'

// Drive — share-link role change propagation against the stub package.
//
// What this replaces:
//   share-link-role-change.spec.ts (deleted). The original spec mounted
//   a real docx editor and probed ProseMirror to assert read-only
//   enforcement after the role flip. Read-only enforcement is text/calc's
//   responsibility to test; drive's contract is "the share session +
//   mount object the route builds matches the link's CURRENT role on
//   each session mint." That's what this spec asserts via the stub's
//   data-test-ids.
//
// Drive-owned surface this DOES test:
//   - ShareEditorView's subtitle ("sign in to edit" hint for editor-role
//     anons). That's rendered by drive's public-screens/share/[token].tsx,
//     so a drive E2E asserting on it is in scope.

const STUB_MIME = 'application/x-tinycld-stub'
const PB_URL = 'http://127.0.0.1:7200'
const TEST_TIMEOUT = 120_000

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

// Updates the share link's role directly via PB's collection update API.
// There is no /api/drive/share-link/{id} PATCH endpoint; the
// drive_share_links collection's updateRule already requires the caller
// to own the underlying item (same rule the Go create/delete handlers
// enforce), so an owner PATCH against the collection is the inviter-
// driven path. The session endpoint reads `role` live on every mint, so
// flipping the column in place is enough for the next session POST to
// see the new role — no token churn.
async function updateShareLinkRole(
    linkId: string,
    role: 'viewer' | 'commentor' | 'editor'
): Promise<void> {
    const token = await authTokenForTestUser()
    const res = await fetch(`${PB_URL}/api/collections/drive_share_links/records/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ role }),
    })
    if (!res.ok) {
        throw new Error(`Update share link role failed: ${res.status} ${await res.text()}`)
    }
}

async function readStubRole(page: Page): Promise<string> {
    const text = await page.locator('[data-test-id="stub-role"]').first().innerText()
    return text.replace(/^role:\s*/, '').trim()
}

async function readStubDisplayName(page: Page): Promise<string> {
    const text = await page
        .locator('[data-test-id="stub-identity-displayName"]')
        .first()
        .innerText()
    return text.replace(/^identity\.displayName:\s*/, '').trim()
}

test.describe('Drive — share link role change (stub)', () => {
    test.describe.configure({ mode: 'serial' })
    // Needs the @tinycld/share-stub package assembled (CI scaffolds it); skip on
    // a plain dev workspace where it isn't present.
    test.skip(!shareStubInstalled(), '@tinycld/share-stub not assembled in this workspace')

    test('viewer link upgraded to editor: anon mount flips role + subtitle hint appears after reload', async ({
        browser,
    }) => {
        test.setTimeout(TEST_TIMEOUT)

        const doc = await uploadStubFixture(`stub-upgrade-${Date.now()}`)
        const link = await createShareLink({ itemId: doc.id, role: 'viewer' })

        const context = await browser.newContext()
        await pinXffOnContext(context, uniqueXffIp())
        try {
            const page = await context.newPage()
            await page.goto(`/p/drive/share/${link.token}`)
            await expect(page.getByText('Stub share editor')).toBeVisible()

            // Pre-upgrade: viewer role, no "sign in to edit" hint.
            expect(await readStubRole(page)).toBe('viewer')
            const initialDisplayName = await readStubDisplayName(page)
            expect(initialDisplayName).toMatch(/^Anon /)
            // ShareEditorView's subtitle on a viewer-role link reads
            // "[Shared from X · ]viewing as Anon …" — no editor hint.
            await expect(page.getByText(/sign in to edit/i)).not.toBeVisible()

            // Owner upgrades the SAME link's role. Session endpoint reads
            // role live on each mint, so the next session POST returns
            // role='editor'.
            await updateShareLinkRole(link.id, 'editor')

            // Reload — AsyncStorage on web is localStorage and survives,
            // so the cached anon_id and resulting displayName persist.
            await page.reload()
            await expect(page.getByText('Stub share editor')).toBeVisible()

            // Post-upgrade: role flipped, displayName unchanged.
            expect(await readStubRole(page)).toBe('editor')
            const postDisplayName = await readStubDisplayName(page)
            expect(postDisplayName).toBe(initialDisplayName)

            // Editor-role anon now sees the "sign in to edit" subtitle —
            // owned by drive's public-screens/share/[token].tsx
            // (ShareEditorView ternary on showEditorAnonHint).
            await expect(page.getByText(/sign in to edit/i).first()).toBeVisible()
        } finally {
            await context.close()
        }
    })

    test('viewer link revoked: anon reload shows expired UI', async ({ browser }) => {
        test.setTimeout(TEST_TIMEOUT)

        const doc = await uploadStubFixture(`stub-revoke-${Date.now()}`)
        const link = await createShareLink({ itemId: doc.id, role: 'viewer' })

        const context = await browser.newContext()
        await pinXffOnContext(context, uniqueXffIp())
        try {
            const page = await context.newPage()

            // First visit: stub mounts.
            await page.goto(`/p/drive/share/${link.token}`)
            await expect(page.getByText('Stub share editor')).toBeVisible()

            // Owner revokes. Next mint will 410.
            await revokeShareLink(link.id)

            // Reload — same context, the stale session token + the new
            // 410 from the share endpoint flip the page into the
            // expired UI (PublicShareLayout).
            //
            // Positive control: confirms reload-driven session re-mint
            // observes the state change. If revoke works here but the
            // role-change test above doesn't, the bug is role-flip
            // specific, not reload-cache.
            //
            // useShareSession needs retryOnMount:false (see
            // core/lib/anon-identity.ts) so a 410 doesn't trip an
            // infinite refetch loop driven by the spinner/mount
            // alternation in ShareTokenPage.
            await page.reload()
            await expect(page.getByText('Link expired', { exact: true })).toBeVisible()
            await expect(page.getByText('Stub share editor')).not.toBeVisible()
        } finally {
            await context.close()
        }
    })
})
