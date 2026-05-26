import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { authTokenForTestUser, testUserOrgContext } from './helpers'

// Anon-editing follow-up task 1c (deferred-followups doc, 2026-05-26).
//
// Inviter-driven role change on a drive share link, with reload-based
// propagation. The original spec explicitly defers live push (no WS
// broadcast on link.role flips); v1's contract is "owner updates the
// drive_share_links row → anon visitor reloads → next session mint
// picks up the new role". The reload path goes through useShareSession
// which POSTs /api/drive/share-link/{token}/session — that handler
// reads role from the live DB record, so a PATCH against the record
// between visits is enough to flip the visitor's experience.
//
// Per [[e2e_realtime_flakiness]] memory: serial describes, collision-
// proof doc names, 15s reaction timeouts. We open two browser contexts
// in this file (owner-side direct PB API + anon-side incognito
// browser), so we keep per-test isolation tight by minting one fresh
// link per scenario.

const PB_URL = 'http://127.0.0.1:7200'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const REACTION_TIMEOUT = 15_000
const EDITOR_READY_TIMEOUT = 60_000

// Collision-proof unique doc name. drive_items uniqueness is on
// (org, parent, name); appending a random suffix removes the same-ms
// collision window across parallel workers / restarts.
function uniqueDocName(label: string): string {
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    return `${label}-${stamp}.docx`
}

// Uploads drive/tests/assets/sample.docx as a fresh drive_items row
// owned by the seeded test user. The mime type matters: text's
// registerShareEditor only fires for the docx mime, so a share link on
// a row without it falls back to PublicShareLayout (download view) and
// would never render the subtitle hint we assert on.
async function uploadDocxAsDriveItem(name: string): Promise<{ id: string }> {
    const token = await authTokenForTestUser()
    const ctx = await testUserOrgContext()
    const fixturePath = join(import.meta.dirname, 'assets', 'sample.docx')
    const bytes = readFileSync(fixturePath)
    const form = new FormData()
    form.append('org', ctx.orgId)
    form.append('name', name)
    form.append('is_folder', 'false')
    form.append('mime_type', DOCX_MIME)
    form.append('parent', '')
    form.append('created_by', ctx.userOrgId)
    form.append('size', String(bytes.length))
    form.append('file', new Blob([new Uint8Array(bytes)], { type: DOCX_MIME }), name)
    const res = await fetch(`${PB_URL}/api/collections/drive_items/records`, {
        method: 'POST',
        headers: { Authorization: token },
        body: form,
    })
    if (!res.ok) {
        throw new Error(`Upload drive_item failed: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as { id: string }
}

interface ShareLink {
    id: string
    token: string
}

// Mints a public share link on `itemId` with the given role by hitting
// the drive endpoint the in-app ShareDialog uses. This is the exact
// path an owner would walk; we just skip the UI.
async function createShareLink(
    itemId: string,
    role: 'viewer' | 'commentor' | 'editor'
): Promise<ShareLink> {
    const token = await authTokenForTestUser()
    const res = await fetch(`${PB_URL}/api/drive/share-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ item_id: itemId, role }),
    })
    if (!res.ok) {
        throw new Error(`Create share link failed: ${res.status} ${await res.text()}`)
    }
    const body = (await res.json()) as { id: string; token: string }
    return { id: body.id, token: body.token }
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

// Revokes a share link via the production endpoint (sets is_active=false).
// findShareLinkByToken in endpoints_public_share.go returns 410 on
// !is_active, which surfaces as PublicShareLayout's "Link expired" copy.
async function revokeShareLink(linkId: string): Promise<void> {
    const token = await authTokenForTestUser()
    const res = await fetch(`${PB_URL}/api/drive/share-link/${linkId}`, {
        method: 'DELETE',
        headers: { Authorization: token },
    })
    if (!res.ok) {
        throw new Error(`Revoke share link failed: ${res.status} ${await res.text()}`)
    }
}

// The share editor mounts the same .ProseMirror host as the in-app
// editor — but the anon mount has canEdit:false (see buildAnonMount in
// core/lib/editor/use-share-editor-mount.tsx), so typing should be
// blocked. We assert via the visible text inside the editor before and
// after, not via Tiptap's editable flag (which is internal).
function editorRoot(page: Page) {
    return page.locator('.tinycld-document-editor .ProseMirror')
}

async function waitForShareEditor(page: Page): Promise<void> {
    await expect(editorRoot(page)).toBeVisible({ timeout: EDITOR_READY_TIMEOUT })
}

// publicShareLimiter (60 req/min/IP) gates BOTH the session POST and
// the metadata GET. Every page load fires both, and sequential tests
// in this file run through the same dev proxy IP (127.0.0.1) — without
// a per-context X-Forwarded-For pin the second test in the file
// inherits the first test's burnt-down budget and can get 429s instead
// of the 410 we're asserting on. getClientIP in
// endpoints_public_share.go checks XFF first, so a unique IP per
// context puts each test on its own counter.
function uniqueXffIp(): string {
    const a = Math.floor(Math.random() * 254) + 1
    const b = Math.floor(Math.random() * 254) + 1
    const c = Math.floor(Math.random() * 254) + 1
    return `10.${a}.${b}.${c}`
}

// Pins X-Forwarded-For on every API request originating from this
// browser context. extraHTTPHeaders / context-level headers don't
// reliably make it onto fetches Playwright generates internally;
// route-level rewrite is the only path that guarantees the header
// lands on every request — including the ones useShareSession and
// PublicShareLayout fire under the hood on each page load.
async function pinXffOnContext(
    ctx: import('@playwright/test').BrowserContext,
    ip: string
): Promise<void> {
    await ctx.route('**/api/**', async route => {
        const headers = { ...route.request().headers(), 'x-forwarded-for': ip }
        await route.continue({ headers })
    })
}

test.describe('Drive — Share link role change (reload propagation)', () => {
    test.describe.configure({ mode: 'serial' })

    test('viewer link upgraded to editor: subtitle hint appears after reload', async ({
        browser,
    }) => {
        test.setTimeout(180_000)

        const docName = uniqueDocName('share-role-upgrade')
        const { id: itemId } = await uploadDocxAsDriveItem(docName)
        const link = await createShareLink(itemId, 'viewer')

        const anonContext = await browser.newContext()
        await pinXffOnContext(anonContext, uniqueXffIp())
        try {
            const anonPage = await anonContext.newPage()
            await anonPage.goto(`/share/${link.token}`)

            // The read-only editor mounts for an anon visitor on a docx
            // mime — buildAnonMount sets canEdit:false but the
            // ShareEditor component itself still renders.
            await waitForShareEditor(anonPage)

            // Subtitle should NOT show the editor sign-in hint on a
            // viewer-role link (the hint is gated on session.role ===
            // 'editor', per public-screens/share/[token].tsx
            // ShareEditorView). Subtitle text is one of:
            //   "Viewing as Anon …"                      (no orgName)
            //   "Shared from {org} · viewing as Anon …"  (orgName set)
            // Note the second form lowercases "viewing"; match case-
            // insensitively. The subtitle Text node is the only place
            // "viewing as Anon …" appears on the page.
            const initialSubtitle = await anonPage
                .getByText(/viewing as Anon /i, { exact: false })
                .first()
                .textContent({ timeout: REACTION_TIMEOUT })
            expect(initialSubtitle).toBeTruthy()
            expect(initialSubtitle?.toLowerCase()).not.toContain('sign in to edit')
            const animalName = initialSubtitle?.match(/Anon [A-Za-z]+ [A-Za-z]+/)?.[0] ?? ''
            expect(animalName).toMatch(/^Anon /)

            // Confirm the editor is genuinely read-only for the viewer.
            // We don't drive ProseMirror's `editable` directly — instead
            // we focus + type a sentinel and assert the editor's text
            // content is unchanged. (A truly editable PM would now show
            // the sentinel anywhere in its text.)
            const before = (await editorRoot(anonPage).textContent()) ?? ''
            await editorRoot(anonPage).click()
            await anonPage.keyboard.type('ROLECHANGE-SENTINEL', { delay: 5 })
            // Brief wait so PM has time to dispatch any transaction it
            // might emit — without this a synchronous block wouldn't be
            // distinguishable from "we just didn't wait".
            await anonPage.waitForTimeout(500)
            const afterTry = (await editorRoot(anonPage).textContent()) ?? ''
            expect(afterTry).not.toContain('ROLECHANGE-SENTINEL')
            expect(afterTry).toBe(before)

            // Owner upgrades the SAME link's role to editor. No new
            // token is minted — the existing share URL/anon_id pair
            // should now resolve to an editor-role session on the next
            // session mint.
            await updateShareLinkRole(link.id, 'editor')

            // Reload (same context — AsyncStorage on web is localStorage
            // and survives the reload, so the cached anon_id and the
            // resulting Anon-Animal name persist).
            await anonPage.reload()
            await waitForShareEditor(anonPage)

            // Editor-role anon now sees the "sign in to edit" subtitle
            // (re-introduced in task 2c, see ShareEditorView). The
            // session endpoint reads link.role live on each mint, so
            // the fresh session.role = 'editor' flips
            // showEditorAnonHint on, and the subtitle becomes "Sign in
            // to edit · viewing as Anon …" (or "Shared from {org} ·
            // sign in to edit · viewing as Anon …" when orgName is
            // set).
            const upgradedSubtitle = await anonPage
                .getByText(/sign in to edit/i, { exact: false })
                .first()
                .textContent({ timeout: REACTION_TIMEOUT })
            expect(upgradedSubtitle).toBeTruthy()
            expect(upgradedSubtitle?.toLowerCase()).toContain('sign in to edit')

            // Identity is cookie-bound, not role-bound: the same
            // anon_id (and therefore the same Anon Adjective Animal
            // name) should appear in the upgraded subtitle.
            if (animalName) {
                expect(upgradedSubtitle).toContain(animalName)
            }
        } finally {
            await anonContext.close()
        }
    })

    test('viewer link revoked: anon reload shows expired UI', async ({ browser }) => {
        test.setTimeout(180_000)

        // Positive control for the reload path: confirm that a state
        // change made between visits is genuinely observed by the next
        // session mint. If this passes for revoke but the upgrade test
        // above fails, the upgrade failure is about role-flip
        // specifically, not about reload-vs-cache.
        //
        // NOTE: This scenario requires `retryOnMount: false` on
        // `useShareSession` (see core/lib/anon-identity.ts). Without
        // it, a 410 response triggers an infinite React-Query refetch
        // loop driven by ShareTokenPage's spinner/ShareView render
        // alternation; that loop saturates the share-link rate
        // limiter (60/min/IP) and the expired-link UI never renders.
        // `retry: false` alone is not enough — `retryOnMount` is the
        // option that suppresses refetch on remount when the query is
        // in error state.
        const docName = uniqueDocName('share-role-revoke')
        const { id: itemId } = await uploadDocxAsDriveItem(docName)
        const link = await createShareLink(itemId, 'viewer')

        const anonContext = await browser.newContext()
        await pinXffOnContext(anonContext, uniqueXffIp())
        try {
            const anonPage = await anonContext.newPage()
            await anonPage.goto(`/share/${link.token}`)
            await waitForShareEditor(anonPage)

            await revokeShareLink(link.id)

            await anonPage.reload()

            // On 410 from /api/drive/share-link/{token}, useShareSession's
            // fetch rejects → ShareView falls back to PublicShareLayout
            // → fetchMetadata also 410s → ErrorDisplay renders the
            // "Link expired" title with "expired or been revoked"
            // description. Match the layout's exact copy.
            await expect(anonPage.getByText('Link expired', { exact: true })).toBeVisible({
                timeout: REACTION_TIMEOUT,
            })
            await expect(
                anonPage.getByText(/expired or been revoked/i, { exact: false })
            ).toBeVisible({ timeout: REACTION_TIMEOUT })
        } finally {
            await anonContext.close()
        }
    })
})
