import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { login, ORG_SLUG } from '../../app/tests/e2e/helpers'
import { createShareLink, revokeShareLink, uploadFileAsDriveItem } from './helpers'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Drive ships small calc/text fixtures under tests/assets. tiny.xlsx is a
// minimal valid workbook; the share-link-role-change spec already exercises
// drive/tests/assets/sample.docx the same way for the text side.
const CALC_FIXTURE = join(import.meta.dirname, 'assets', 'tiny.xlsx')
const TEXT_FIXTURE = join(import.meta.dirname, 'assets', 'sample.docx')

test.describe.configure({ mode: 'serial' })

// View-3 = anonymous read-only access to a viewer-role share link.
//
// Setup path: an org member creates a calc doc and a text doc via the
// real package UIs, mints a viewer-role share link for each via the
// production /api/drive/share-link endpoint, then a separate incognito
// browser context (no PB auth, no AsyncStorage) visits the share URL.
// The share screen mounts the REAL editor (not the static preview that
// view-3 replaced), reads the anon "Anon {Adjective} {Animal}" identity
// from a freshly-minted anon_id, and renders read-only.
//
// Conventions:
//   - collision-proof doc names (Date.now + 4 random bytes hex) so
//     parallel workers can't ever pick the same fixture name
//   - 15s reaction timeouts on visibility assertions
//   - a separate browser.newContext() per anon visit (anon identity is
//     scoped to the AsyncStorage of the context); reuse the same
//     context only when testing reload-persistence

// Editor mount + realtime room bootstrap (xlsx → Y.Doc parse, then
// SyncReply) regularly approaches 60s under worker contention; keep the
// per-test budget generous so a slow CI run doesn't false-fail.
const TEST_TIMEOUT = 120_000
const VISIBILITY_TIMEOUT = 15_000
const EDITOR_READY_TIMEOUT = 60_000

function uniqueStamp(): string {
    return `${Date.now()}-${randomBytes(4).toString('hex')}`
}

// Uploads tiny.xlsx as a fresh drive_items row. The realtime broker
// parses the xlsx into a Y.Doc on the first open, so the file must be a
// real workbook. Using a fixture (instead of the calc UI's blank-workbook
// path) decouples this spec from the calc index's own mount timing and
// avoids stacking two flaky steps in the setup phase.
async function uploadCalcFixture(): Promise<{ itemId: string; name: string }> {
    const name = `calc-view3-${uniqueStamp()}.xlsx`
    const { id } = await uploadFileAsDriveItem({
        fixturePath: CALC_FIXTURE,
        name,
        mimeType: XLSX_MIME,
    })
    return { itemId: id, name }
}

// Uploads sample.docx as a fresh drive_items row. Same rationale as
// uploadCalcFixture — bypassing the text index's "New document" UI keeps
// the setup deterministic, and the share-link-role-change spec already
// uses the same fixture with no Y.Doc bootstrap issues.
async function uploadTextFixture(): Promise<{ itemId: string; name: string }> {
    const name = `text-view3-${uniqueStamp()}.docx`
    const { id } = await uploadFileAsDriveItem({
        fixturePath: TEXT_FIXTURE,
        name,
        mimeType: DOCX_MIME,
    })
    return { itemId: id, name }
}

// Asserts the share screen mounted the real editor (not a static preview)
// for the given mime kind. The shared header rendered by ShareEditorView
// in core lives outside the editor itself and carries the doc name +
// "viewing as Anon …" subtitle.
async function assertShareEditorMounted(
    page: Page,
    opts: { kind: 'calc' | 'text'; docName: string }
): Promise<void> {
    // Doc title text appears in the ShareEditorView header.
    await expect(page.getByText(opts.docName, { exact: false }).first()).toBeVisible({
        timeout: EDITOR_READY_TIMEOUT,
    })
    // Subtitle line: "Viewing as Anon {Adjective} {Animal}" (or "Shared
    // from {orgName} · viewing as Anon …"). We don't pin the animal — it
    // is a deterministic hash of a freshly-minted, per-context anon_id —
    // so we just match the prefix and any "Anon " token after it.
    await expect(page.getByText(/viewing as Anon /i).first()).toBeVisible({
        timeout: VISIBILITY_TIMEOUT,
    })

    if (opts.kind === 'calc') {
        // Real calc editor: the workbook header is emitted with a
        // data-test-id by CalcEditorFromMount, and the grid renders
        // Cell A1 once the realtime room is ready.
        await expect(page.locator('[data-test-id="calc-workbook-header"]').first()).toBeVisible({
            timeout: EDITOR_READY_TIMEOUT,
        })
        await expect(page.getByLabel('Cell A1', { exact: true })).toBeVisible({
            timeout: EDITOR_READY_TIMEOUT,
        })
    } else {
        // Real text editor: the ProseMirror editor mounts as a contenteditable
        // host inside `.tinycld-document-editor .ProseMirror`. This is the
        // deterministic "real editor mounted, not the static preview"
        // signal — the same one share-link-role-change.spec.ts asserts on.
        await expect(page.locator('.tinycld-document-editor .ProseMirror')).toBeVisible({
            timeout: EDITOR_READY_TIMEOUT,
        })
    }
}

// Pulls out the "Anon {Adjective} {Animal}" identity rendered in the
// share-editor subtitle. The subtitle is one of:
//   "Shared from {org} · viewing as {displayName}"
//   "Viewing as {displayName}"
async function readAnonIdentity(page: Page): Promise<string> {
    const subtitle = await page
        .getByText(/viewing as Anon /i)
        .first()
        .innerText()
    const match = subtitle.match(/viewing as (Anon [^·]+)/i)
    if (!match) throw new Error(`Could not parse anon identity from subtitle: ${subtitle}`)
    return match[1].trim()
}

// publicShareLimiter (60 req/min/IP, configured in
// drive/server/endpoints_public_share.go) gates the session POST + the
// metadata GET — every test in this file fires both. Without a per-
// context X-Forwarded-For pin the whole suite shares one counter
// against 127.0.0.1 (the dev-proxy loopback), and later tests burn
// through their budget before they reach the assertion. The handler
// reads XFF first via getClientIP, so a unique RFC-1918 IP per context
// puts each test on its own counter.
function uniqueXffIp(): string {
    const a = Math.floor(Math.random() * 254) + 1
    const b = Math.floor(Math.random() * 254) + 1
    const c = Math.floor(Math.random() * 254) + 1
    return `10.${a}.${b}.${c}`
}

// Pure `extraHTTPHeaders` and context-level headers don't reliably land
// on internal fetches Playwright generates (e.g. the page's fetch from
// React Query). Route-level rewrite is the only path that guarantees
// XFF lands on every /api/** request — same pattern the role-change
// spec uses.
async function pinXffOnContext(ctx: BrowserContext, ip: string): Promise<void> {
    await ctx.route('**/api/**', async route => {
        const headers = {
            ...route.request().headers(),
            'x-forwarded-for': ip,
        }
        await route.continue({ headers })
    })
}

// Opens a share link in a brand-new browser context (no cookies / no
// AsyncStorage carried over from any prior visit). Returns the context
// and the page so the caller can dispose the context.
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

test.describe('Drive — Share link view 3 (anon read-only viewer)', () => {
    // Per-suite fixtures: created once, shared across the 6 scenarios.
    // Created in the first beforeAll-style test rather than test.beforeAll
    // because Playwright's beforeAll doesn't get a `page` fixture (we'd
    // have to manually mint a context). A single setup test that the
    // others depend on, in serial mode, is the cleanest pattern here.
    let calcFixture: { itemId: string; name: string; token: string; linkId: string }
    let textFixture: { itemId: string; name: string; token: string; linkId: string }

    test('setup: upload calc + text fixtures and mint viewer share links', async () => {
        test.setTimeout(TEST_TIMEOUT)
        const calcDoc = await uploadCalcFixture()
        const calcLink = await createShareLink({ itemId: calcDoc.itemId, role: 'viewer' })
        calcFixture = {
            itemId: calcDoc.itemId,
            name: calcDoc.name,
            token: calcLink.token,
            linkId: calcLink.id,
        }

        const textDoc = await uploadTextFixture()
        const textLink = await createShareLink({ itemId: textDoc.itemId, role: 'viewer' })
        textFixture = {
            itemId: textDoc.itemId,
            name: textDoc.name,
            token: textLink.token,
            linkId: textLink.id,
        }

        expect(calcFixture.token).toMatch(/^[0-9a-f]{64}$/)
        expect(textFixture.token).toMatch(/^[0-9a-f]{64}$/)
    })

    test('mount: calc share link renders the real read-only editor for an anon visitor', async ({
        browser,
    }) => {
        test.setTimeout(TEST_TIMEOUT)
        const { context, page } = await openAnonShareLink(browser, calcFixture.token)
        try {
            await assertShareEditorMounted(page, {
                kind: 'calc',
                docName: calcFixture.name,
            })

            // No comment UI for a viewer — `OpenCommentsDrawerButton` etc.
            // are mounted only when the editor is the org-member detail
            // route, not the share-route shell. Same for the "Sign in
            // to …" CTA: that only renders for commentor/editor roles
            // (showSignInBanner = isAnon && needsAuthForRole).
            await expect(page.getByRole('button', { name: /open comments/i })).toHaveCount(0)
            await expect(page.getByText(/sign in to/i)).toHaveCount(0)
        } finally {
            await context.close()
        }
    })

    test('mount: text share link renders the real read-only editor for an anon visitor', async ({
        browser,
    }) => {
        test.setTimeout(TEST_TIMEOUT)
        const { context, page } = await openAnonShareLink(browser, textFixture.token)
        try {
            await assertShareEditorMounted(page, {
                kind: 'text',
                docName: textFixture.name,
            })

            await expect(page.getByRole('button', { name: /open comments/i })).toHaveCount(0)
            await expect(page.getByText(/sign in to/i)).toHaveCount(0)
        } finally {
            await context.close()
        }
    })

    test('write attempt on calc: clicking a cell + typing does not change the cell value', async ({
        browser,
    }) => {
        test.setTimeout(TEST_TIMEOUT)
        const { context, page } = await openAnonShareLink(browser, calcFixture.token)
        try {
            await assertShareEditorMounted(page, {
                kind: 'calc',
                docName: calcFixture.name,
            })

            // Snapshot the cell BEFORE attempting the write. A fresh
            // blank workbook has every cell empty.
            const cellBefore = await page.getByLabel('Cell A1', { exact: true }).innerText()

            await page.getByLabel('Cell A1', { exact: true }).click()
            // In read-only mode the cell's onKey handler returns early
            // (Cell.tsx: `if (readOnly) return`), so no edit session
            // opens and the keystroke is dropped on the floor.
            await page.keyboard.type('hello-from-anon')
            // Give the editor a beat to react. We don't expect a write
            // to land, but a real bug would propagate within microseconds
            // — a small wait is plenty to surface a failure.
            await page.waitForTimeout(500)

            const cellAfter = await page.getByLabel('Cell A1', { exact: true }).innerText()
            expect(cellAfter).toBe(cellBefore)
        } finally {
            await context.close()
        }
    })

    test('write attempt on text: focusing the body + typing does not insert characters', async ({
        browser,
    }) => {
        test.setTimeout(TEST_TIMEOUT)
        const { context, page } = await openAnonShareLink(browser, textFixture.token)
        try {
            await assertShareEditorMounted(page, {
                kind: 'text',
                docName: textFixture.name,
            })

            // The text editor mounts ProseMirror directly into the page
            // DOM (web: `.tinycld-document-editor .ProseMirror`; no iframe).
            // For a read-only anon mount the PM editor is non-editable,
            // so a keystroke does not modify the body. We click into the
            // editor host, type a probe, and verify it never appears in
            // the doc body.
            const probe = `anon-write-${randomBytes(4).toString('hex')}`
            const editor = page.locator('.tinycld-document-editor .ProseMirror').first()
            await editor.click()
            await page.keyboard.type(probe)
            await page.waitForTimeout(500)
            await expect(page.getByText(probe)).toHaveCount(0)
        } finally {
            await context.close()
        }
    })

    test('server-side block: owner page reload shows the calc + text docs are unchanged', async ({
        page,
    }) => {
        test.setTimeout(TEST_TIMEOUT)
        await login(page)
        // Calc: open the owner-side editor, confirm A1 does not contain
        // the probe string the anon write test typed. tiny.xlsx ships
        // with its own content in A1; we don't care what it is, only
        // that the anon-typed `hello-from-anon` string never landed.
        await page.goto(`/a/${ORG_SLUG}/calc/${calcFixture.itemId}`)
        await expect(page.getByLabel('Cell A1', { exact: true })).toBeVisible({
            timeout: EDITOR_READY_TIMEOUT,
        })
        await expect(page.getByText('hello-from-anon')).toHaveCount(0)

        // Text: open the owner-side editor, confirm the body contains no
        // anon-write probe strings. The probe used in the text write
        // test was random per run; we check that nothing matching the
        // pattern `anon-write-<hex>` survived.
        await page.goto(`/a/${ORG_SLUG}/text/${textFixture.itemId}`)
        await expect(
            page.getByRole('button', { name: /^Rename document, currently / }).first()
        ).toBeVisible({
            timeout: EDITOR_READY_TIMEOUT,
        })
        await expect(page.getByText(/anon-write-[0-9a-f]+/)).toHaveCount(0)
    })

    test('identity persistence: reloading the share link in the same context yields the same Anon name', async ({
        browser,
    }) => {
        test.setTimeout(TEST_TIMEOUT)
        const context = await browser.newContext()
        await pinXffOnContext(context, uniqueXffIp())
        try {
            const page = await context.newPage()
            await page.goto(`/share/${calcFixture.token}`)
            await assertShareEditorMounted(page, {
                kind: 'calc',
                docName: calcFixture.name,
            })
            const identityFirst = await readAnonIdentity(page)

            // Reload — the anon_id cookie / AsyncStorage entry persists
            // (writeAnonId in core/lib/anon-identity.ts), so the server
            // re-derives the same display name from the same anon_id.
            await page.reload()
            await assertShareEditorMounted(page, {
                kind: 'calc',
                docName: calcFixture.name,
            })
            const identitySecond = await readAnonIdentity(page)

            expect(identitySecond).toBe(identityFirst)
        } finally {
            await context.close()
        }
    })

    test('revoke: revoked share link renders the "Link expired" UI', async ({ browser }) => {
        test.setTimeout(TEST_TIMEOUT)
        const oneShot = await createShareLink({
            itemId: calcFixture.itemId,
            role: 'viewer',
        })
        await revokeShareLink(oneShot.id)

        const context = await browser.newContext()
        await pinXffOnContext(context, uniqueXffIp())
        try {
            const page = await context.newPage()
            await page.goto(`/share/${oneShot.token}`)
            await expect(page.getByText('Link expired', { exact: true })).toBeVisible({
                timeout: VISIBILITY_TIMEOUT,
            })
        } finally {
            await context.close()
        }
    })
})
