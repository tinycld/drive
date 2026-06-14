import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { ORG_SLUG, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '@tinycld/core/e2e-helpers'

// Drive uses FrozenSlideStack inside its package layout, so navigating
// from /drive → /drive/folder/<id> → another folder keeps every prior
// folder screen mounted in the DOM. A bare `getByText('Projects')` will
// match hidden snapshots in those frozen routes alongside the active
// screen, and `.first()` may resolve to whichever one rendered first.
//
// driveItem is the row-level locator scoped to *visible* DOM, anchored
// on the package's grid/list row aria-label format
// (`<name> <Month D, YYYY>`).
export function driveItem(page: Page, name: string | RegExp): Locator {
    const namePattern = typeof name === 'string' ? new RegExp(`^${escapeRegex(name)} `) : name
    // Rows/cards are labelled clickable regions (not <button> — they contain
    // their own action buttons), so match on aria-label rather than role.
    return page.getByLabel(namePattern).filter({ visible: true }).first()
}

export async function openDriveItem(page: Page, name: string | RegExp) {
    await dismissErrorOverlay(page)
    const item = driveItem(page, name)
    await expect(item).toBeVisible({ timeout: 10_000 })
    await item.click()
}

// Drives a drag-and-drop move via react-native-drax. Drax activates a drag on a
// long-press and then tracks pointer movement, so a one-shot Playwright
// dragTo() won't trigger it — we drive the raw mouse by hand.
//
// The flake this avoids: under CPU load a fixed `waitForTimeout` after
// mousedown can elapse in wall-clock before the app's JS thread has even run
// Drax's long-press activation, so the subsequent moves arrive before a drag
// exists and are dropped — the gesture silently no-ops. Instead we wait on the
// floating drag preview (`drive-drag-preview`), the same visible cue the user
// sees once a drag is live: poll-nudging the pointer until it appears proves the
// drag actually activated before we travel to the target. Then we step onto the
// target (Drax re-runs its hit-test per move) and settle before releasing.
//
// Both locators must be visible. Grid cards are the most reliable source/target
// (the whole card is the drag handle and the hit area).
export async function dragItemOnto(page: Page, source: Locator, target: Locator): Promise<void> {
    const from = await source.boundingBox()
    const to = await target.boundingBox()
    if (!from || !to) {
        throw new Error('dragItemOnto: source or target has no bounding box (not visible?)')
    }
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
    const preview = page.getByTestId('drive-drag-preview')

    // Activate the drag and wait until the floating preview exists. Drax keys
    // activation off a CONTINUOUS stream of pointer moves past its touch-slop
    // (~15px) — a single jump can be missed, and a tiny grip source needs the
    // gesture tracked step by step. Under heavy CPU contention the starved JS
    // thread can drop a whole press→move burst, so if the preview hasn't
    // appeared we fully release and re-press (what a user does when a grab
    // doesn't take) rather than hoping more moves on a dead gesture help. The
    // preview's presence is the deterministic "drag is live" signal.
    await expect(async () => {
        if ((await preview.count()) === 0) {
            await page.mouse.up().catch(() => {})
            await page.mouse.move(start.x, start.y)
            await page.mouse.down()
            await page.waitForTimeout(60)
            for (let px = 4; px <= 32; px += 4) {
                await page.mouse.move(start.x + px, start.y + px)
            }
        }
        await expect(preview).toHaveCount(1, { timeout: 300 })
    }).toPass({ timeout: 15_000 })

    // Travel to the target in steps so Drax re-runs its receiver hit-test along
    // the way; a single jump can land without ever flagging the target.
    const STEPS = 12
    for (let i = 1; i <= STEPS; i++) {
        await page.mouse.move(
            start.x + ((end.x - start.x) * i) / STEPS,
            start.y + ((end.y - start.y) * i) / STEPS
        )
    }

    // Wait for the target to actually report receiving before releasing.
    // FolderDropTarget mounts `drop-target-receiving` while a valid drag hovers
    // it (the same cue as its highlight border); only one target receives at a
    // time. Releasing before this is set is the drop-misses-narrow-target flake
    // — the hit-test hadn't registered. Re-nudge on the target each poll so Drax
    // keeps re-running the hit-test.
    const receiving = page.getByTestId('drop-target-receiving')
    await expect(async () => {
        await page.mouse.move(end.x, end.y)
        await page.mouse.move(end.x + 2, end.y + 2)
        await page.mouse.move(end.x, end.y)
        await expect(receiving).toHaveCount(1, { timeout: 200 })
    }).toPass({ timeout: 10_000 })

    await page.mouse.up()
}

export async function dismissErrorOverlay(page: Page) {
    const dismiss = page.getByRole('button', { name: 'Dismiss error' })
    if ((await dismiss.count()) > 0 && (await dismiss.first().isVisible())) {
        await dismiss
            .first()
            .click()
            .catch(() => {
                /* overlay already gone */
            })
    }
}

export function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The share-stub specs need the @tinycld/share-stub package assembled into the
// workspace (it registers a share editor for a fake mime type). CI scaffolds it
// (ci.yml "Scaffold share-stub package"); a plain dev workspace usually hasn't,
// so those specs would fail with no stub editor to mount. Detect its presence so
// the specs can `test.skip` when it's absent rather than fail. The scaffold
// writes the package at <workspaceRoot>/share-stub (sibling of drive/).
export function shareStubInstalled(): boolean {
    // drive/tests/helpers.ts → drive/ → workspace root → share-stub/
    const stubDir = join(import.meta.dirname, '..', '..', 'share-stub')
    return existsSync(stubDir)
}

// The clickable column heading rendered by core's DataTableHeader. The
// sortable header cell is a Pressable exposed with accessibilityRole=button
// and label `Sort by <Column>` (e.g. "Sort by Name").
export function sortableHeader(page: Page, label: string): Locator {
    return page.getByRole('button', { name: `Sort by ${label}`, exact: true })
}

// Returns, in DOM order, which of the given fixture names appear as visible
// drive rows. Rows are role=button with accessibilityLabel
// `<name> <owner?> <date>`; we keep a row when its label starts with one of
// the `among` names. Used to assert sort order while ignoring unrelated
// seeded rows in the same folder.
export async function orderedRowNames(page: Page, among: string[]): Promise<string[]> {
    // Rows are labelled clickable regions (aria-label), not buttons — read all
    // visible aria-labelled elements in DOM order and keep the ones we track.
    const labels = await page
        .locator('[aria-label]')
        .filter({ visible: true })
        .evaluateAll(els => els.map(el => el.getAttribute('aria-label') ?? '').filter(Boolean))
    const result: string[] = []
    for (const label of labels) {
        const match = among.find(name => label.startsWith(`${name} `))
        if (match) result.push(match)
    }
    return result
}

// PB sits behind the dev.ts proxy on the test Expo port. /api/* routes
// through to PB transparently — see scripts/dev.ts::isPbPath.
const PB_URL = 'http://127.0.0.1:7200'

let cachedAuthToken: string | null = null
let cachedOrgContext: { orgId: string; userOrgId: string } | null = null

async function authAsTestUser(): Promise<string> {
    if (cachedAuthToken) return cachedAuthToken
    const res = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: TEST_USER_EMAIL, password: TEST_USER_PASSWORD }),
    })
    if (!res.ok) {
        throw new Error(`PB auth failed: ${res.status} ${await res.text()}`)
    }
    const { token } = (await res.json()) as { token: string }
    cachedAuthToken = token
    return token
}

async function resolveOrgContext(token: string): Promise<{ orgId: string; userOrgId: string }> {
    if (cachedOrgContext) return cachedOrgContext
    const me = await fetch(`${PB_URL}/api/collections/users/auth-refresh`, {
        method: 'POST',
        headers: { Authorization: token },
    })
    const meBody = (await me.json()) as { record?: { id: string } }
    const userId = meBody.record?.id
    if (!userId) throw new Error(`auth-refresh returned no user record`)

    const orgs = await fetch(
        `${PB_URL}/api/collections/orgs/records?filter=${encodeURIComponent(`slug='${ORG_SLUG}'`)}`,
        { headers: { Authorization: token } }
    )
    const orgItems = (await orgs.json()) as { items: { id: string }[] }
    if (!orgItems.items[0]) throw new Error(`Org ${ORG_SLUG} not found`)
    const orgId = orgItems.items[0].id

    const userOrgs = await fetch(
        `${PB_URL}/api/collections/user_org/records?filter=${encodeURIComponent(
            `org='${orgId}' && user='${userId}'`
        )}`,
        { headers: { Authorization: token } }
    )
    const userOrgItems = (await userOrgs.json()) as { items: { id: string }[] }
    if (!userOrgItems.items[0]) throw new Error(`user_org for ${ORG_SLUG} not found`)
    cachedOrgContext = { orgId, userOrgId: userOrgItems.items[0].id }
    return cachedOrgContext
}

export async function authTokenForTestUser(): Promise<string> {
    return authAsTestUser()
}

export async function testUserOrgContext(): Promise<{ orgId: string; userOrgId: string }> {
    const token = await authAsTestUser()
    return resolveOrgContext(token)
}

// Create a drive_items record via the PB REST API. Tests that need a
// fixture file/folder to mutate should create one here so they don't
// race seed reads.
export async function createDriveItem(opts: {
    name: string
    parent?: string
    isFolder?: boolean
}): Promise<{ id: string; name: string }> {
    const token = await authAsTestUser()
    const { orgId, userOrgId } = await resolveOrgContext(token)
    const res = await fetch(`${PB_URL}/api/collections/drive_items/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({
            org: orgId,
            created_by: userOrgId,
            parent: opts.parent ?? '',
            name: opts.name,
            is_folder: opts.isFolder ?? false,
            size: 0,
        }),
    })
    if (!res.ok) {
        throw new Error(`Create drive_item failed: ${res.status} ${await res.text()}`)
    }
    const created = (await res.json()) as { id: string; name: string }
    return created
}

export async function findDriveItemByName(opts: {
    name: string
    parent?: string
}): Promise<{ id: string } | null> {
    const token = await authAsTestUser()
    const { orgId } = await resolveOrgContext(token)
    const filter = `org='${orgId}' && name='${opts.name}' && parent='${opts.parent ?? ''}'`
    const res = await fetch(
        `${PB_URL}/api/collections/drive_items/records?filter=${encodeURIComponent(filter)}`,
        { headers: { Authorization: token } }
    )
    if (!res.ok) return null
    const body = (await res.json()) as { items: { id: string }[] }
    return body.items[0] ?? null
}

// Uploads a binary fixture (xlsx / docx / image / etc) as a fresh
// drive_items row owned by the seeded test user. Returns the new
// row id. Use this when a test needs a real file the server-side
// bootstrap (xlsx → Y.Doc, docx → ProseMirror) can chew on — going
// via this REST upload bypasses the blank-doc UI path which can
// race with realtime room mounts under worker contention.
export async function uploadFileAsDriveItem(opts: {
    fixturePath: string
    name: string
    mimeType: string
}): Promise<{ id: string }> {
    const fs = await import('node:fs')
    const token = await authAsTestUser()
    const { orgId, userOrgId } = await resolveOrgContext(token)
    const bytes = fs.readFileSync(opts.fixturePath)
    const form = new FormData()
    form.append('org', orgId)
    form.append('name', opts.name)
    form.append('is_folder', 'false')
    form.append('mime_type', opts.mimeType)
    form.append('parent', '')
    form.append('created_by', userOrgId)
    form.append('size', String(bytes.length))
    form.append('file', new Blob([new Uint8Array(bytes)], { type: opts.mimeType }), opts.name)
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

// Mints a public share link via the production endpoint
// (/api/drive/share-link, POST). Returns the link record's id and token.
// The share-route public URL is `${origin}/p/drive/share/<token>`.
//
// The endpoint requires PB auth (the owner). Use the test user's token
// (authAsTestUser) — the test user owns every item they create, so the
// owner check inside handleCreateShareLink passes.
export async function createShareLink(opts: {
    itemId: string
    role: 'viewer' | 'commentor' | 'editor'
    expiresAt?: string
}): Promise<{ id: string; token: string; url: string }> {
    const authToken = await authAsTestUser()
    const res = await fetch(`${PB_URL}/api/drive/share-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authToken },
        body: JSON.stringify({
            item_id: opts.itemId,
            role: opts.role,
            expires_at: opts.expiresAt ?? '',
        }),
    })
    if (!res.ok) {
        throw new Error(`Create share link failed: ${res.status} ${await res.text()}`)
    }
    return res.json() as Promise<{ id: string; token: string; url: string }>
}

// Revokes a share link via DELETE /api/drive/share-link/<id>. The endpoint
// flips is_active to false; subsequent visits to /p/drive/share/<token> resolve
// to a PublicShareError(410), which the share screen renders as the
// "Link expired" view.
export async function revokeShareLink(linkId: string): Promise<void> {
    const authToken = await authAsTestUser()
    const res = await fetch(`${PB_URL}/api/drive/share-link/${linkId}`, {
        method: 'DELETE',
        headers: { Authorization: authToken },
    })
    if (!res.ok) {
        throw new Error(`Revoke share link failed: ${res.status} ${await res.text()}`)
    }
}
