import { expect, test } from '@playwright/test'
import { login, navigateToPackage, ORG_SLUG } from '../../app/tests/e2e/helpers'
import {
    createDriveItem,
    dismissErrorOverlay,
    driveItem,
    openDriveItem,
    orderedRowNames,
    sortableHeader,
} from './helpers'

// Drive-1 reads seeded folder structure (Projects, Engineering, Personal,
// Archive). drive-2 used to delete + rename seeded *files* under those
// folders, racing with these reads. drive-2 has been switched to
// per-test fixture files, so the seeded folder skeleton stays stable
// for these reads.

test.describe('Drive — Browser', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)
    })

    test('navigate into folder with single click (list view)', async ({ page }) => {
        await openDriveItem(page, 'Projects')

        await expect(driveItem(page, 'Q1 Planning')).toBeVisible({ timeout: 10_000 })
        await expect(driveItem(page, 'Marketing')).toBeVisible()
        await expect(driveItem(page, 'Engineering')).toBeVisible()
    })

    test('navigate into folder with single click (grid view)', async ({ page }) => {
        await expect(driveItem(page, 'Projects')).toBeVisible({ timeout: 10_000 })
        await page.getByTestId('drive-view-grid').click()
        await expect(page.getByText('Folders', { exact: true }).first()).toBeVisible({
            timeout: 5_000,
        })

        await openDriveItem(page, 'Projects')

        await expect(driveItem(page, 'Q1 Planning')).toBeVisible({ timeout: 10_000 })
    })

    test('breadcrumb navigation', async ({ page }) => {
        await openDriveItem(page, 'Projects')
        await expect(driveItem(page, 'Q1 Planning')).toBeVisible({ timeout: 10_000 })

        await openDriveItem(page, 'Engineering')
        await expect(driveItem(page, 'Q1 Planning')).not.toBeVisible({ timeout: 5_000 })

        const myFiles = page.getByText('My Files')
        await myFiles.first().click()
        await expect(driveItem(page, 'Projects')).toBeVisible({ timeout: 10_000 })
    })

    test('clicking a single file does not replace the breadcrumb header', async ({ page }) => {
        // Navigate to an Engineering subfolder; there's always at least one
        // file in there (the seed always wires up an Architecture or
        // similar fixture) — but rather than reading a specific seeded
        // filename (which other tests may rename), find the first
        // non-folder row in the list and operate on it.
        await openDriveItem(page, 'Projects')
        await expect(driveItem(page, 'Q1 Planning')).toBeVisible({ timeout: 10_000 })
        await openDriveItem(page, 'Engineering')

        // Wait for the folder to populate, then pick the first row matching a
        // file extension. The .filter({ visible: true }) chain we used
        // previously was nondeterministic on a slow CI — Playwright doesn't
        // wait for "visible" to flip to true the way a top-level locator
        // would, so the click could race the FlashList row mount. Anchor on
        // a stable file row instead.
        const firstRow = page.getByRole('button', { name: /\.docx/i }).first()
        await expect(firstRow).toBeVisible({ timeout: 30_000 })
        await firstRow.click()

        // The folder-action "New folder" button is part of the normal
        // toolbar; it disappears when the selection toolbar takes over.
        await expect(page.getByRole('button', { name: 'New folder' })).toBeVisible()
    })

    test('selection toolbar appears only after multi-select', async ({ page }) => {
        await openDriveItem(page, 'Projects')
        await expect(driveItem(page, 'Q1 Planning')).toBeVisible({ timeout: 10_000 })
        await openDriveItem(page, 'Engineering')

        // Anchor on visible-by-default file rows. Same fix as the previous
        // test: the previous `.filter({ visible: true })` chain raced the
        // FlashList row mount on CI.
        const fileRows = page.getByRole('button', { name: /\.[a-z]{2,4}\b/i })
        await expect(fileRows.first()).toBeVisible({ timeout: 30_000 })

        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
        await fileRows.nth(0).click({ modifiers: [modifier] })
        await fileRows.nth(1).click({ modifiers: [modifier] })

        await expect(page.getByText(/2 selected|2 items/)).toBeVisible({ timeout: 5_000 })
    })

    test('clicking a column heading sorts the list and toggles direction', async ({ page }) => {
        // Three fixture files in their own folder so unrelated seeded rows
        // don't interfere. Created out of alphabetical order so the list is
        // not already name-sorted by arrival order.
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const folder = await createDriveItem({ name: `Sort-${stamp}`, isFolder: true })
        const alpha = `Alpha-${stamp}.txt`
        const mike = `Mike-${stamp}.txt`
        const zulu = `Zulu-${stamp}.txt`
        await createDriveItem({ name: zulu, parent: folder.id })
        await createDriveItem({ name: mike, parent: folder.id })
        await createDriveItem({ name: alpha, parent: folder.id })
        await page.reload()

        // Column headings only render in list view; a prior test switches to
        // grid and the choice persists across the serial session.
        await page.getByTestId('drive-view-list').click()
        await openDriveItem(page, `Sort-${stamp}`)
        await expect(driveItem(page, alpha)).toBeVisible({ timeout: 10_000 })

        const fixtures = [alpha, mike, zulu]

        // Move the active sort off Name first (sort state can leak in from a
        // prior test in the serial session). Clicking Owner switches the
        // field, so the next Name click is a fresh field-switch — which always
        // starts ascending — rather than an ambiguous toggle.
        await sortableHeader(page, 'Owner').click()

        // Click Name → ascending (field switch resets direction to asc).
        await sortableHeader(page, 'Name').click()
        await expect
            .poll(() => orderedRowNames(page, fixtures), { timeout: 10_000 })
            .toEqual([alpha, mike, zulu])

        // Click Name again → descending toggle.
        await sortableHeader(page, 'Name').click()
        await expect
            .poll(() => orderedRowNames(page, fixtures), { timeout: 10_000 })
            .toEqual([zulu, mike, alpha])
    })

    test('storage indicator shows usage', async ({ page }) => {
        // The sidebar StorageBar has two render modes depending on whether a
        // per-user limit is configured (core settings.storage_limit_bytes):
        //   - with limit:    "X.XX GB of N GB used"
        //   - without limit: "X.XX GB used"
        // CI doesn't seed a limit, so the dev DB and CI hit different
        // branches. Match the substring common to both — the test's intent
        // is "the indicator renders," not "the indicator shows a specific
        // quota."
        //
        // navigateToPackage resolves on `domcontentloaded` (HTML shell), not
        // on SPA hydration, so the sidebar may not be in the DOM the instant
        // this test starts. Wait on a sibling sidebar element first — that's
        // a deterministic "sidebar is rendered" signal, not a longer timeout
        // dressed up as a wait. Once the sidebar nav is up, StorageBar is in
        // the same subtree and its `0.00 GB used` text is already mounted.
        await expect(page.getByText('Trash', { exact: true })).toBeVisible({
            timeout: 15_000,
        })
        await expect(page.getByText(/\d+(\.\d+)? GB used/)).toBeVisible()
    })
})

test.describe('Drive — Mobile', () => {
    test.use({ viewport: { width: 400, height: 800 } })

    test.beforeEach(async ({ page }) => {
        await login(page)
        // Mobile renders MobileLayout (no PackageRail, no PackageSidebar)
        // and uses a bottom tab bar instead. navigateToPackage's rail-
        // click path doesn't work here; goto directly and gate on the
        // seeded "Projects" folder row which proves the mobile screen
        // has hydrated.
        await page.goto(`/a/${ORG_SLUG}/drive`)
        await page
            .getByText('Projects', { exact: true })
            .first()
            .waitFor({ state: 'visible', timeout: 60_000 })
        await dismissErrorOverlay(page)
    })

    test('back button walks up nested folders', async ({ page }) => {
        await openDriveItem(page, 'Projects')
        await expect(driveItem(page, 'Engineering')).toBeVisible({ timeout: 10_000 })
        await openDriveItem(page, 'Engineering')

        const backButton = page.getByRole('button', { name: 'Go up' })
        await expect(backButton).toBeVisible({ timeout: 10_000 })
        await backButton.click()
        await expect(driveItem(page, 'Q1 Planning')).toBeVisible({ timeout: 10_000 })

        await expect(page.getByRole('button', { name: 'Go up' })).toBeVisible()
        await page.getByRole('button', { name: 'Go up' }).click()
        await expect(driveItem(page, 'Personal')).toBeVisible({ timeout: 10_000 })
    })

    // Stefan: "when I open a PDF preview the modal doesn't cover the bottom
    // navigation — it should." The fullscreen preview must paint OVER the
    // MobileTabBar, and switching tabs underneath it (which left the modal
    // stuck) must not be possible while it's open.
    test('file preview covers the bottom nav and is not escapable via the tab bar', async ({
        page,
    }) => {
        // Open the seeded PDF preview.
        await driveItem(page, 'Funny Jokes.pdf').click()

        const modal = page.getByTestId('file-preview-modal')
        await expect(modal).toBeVisible({ timeout: 15_000 })

        // The modal's box must extend to the very bottom of the viewport,
        // covering the tab bar (which sits at the bottom).
        const modalBox = await modal.boundingBox()
        const calendarTab = page.getByTestId('nav-calendar')
        const tabBox = await calendarTab.boundingBox()
        if (!modalBox || !tabBox) throw new Error('missing modal/tab box')
        // The fullscreen modal should reach the viewport bottom (>= the tab
        // bar's top edge), i.e. it overlays the nav rather than stopping above it.
        expect(modalBox.y + modalBox.height).toBeGreaterThanOrEqual(tabBox.y)

        // And a tab tap must not silently swap the screen underneath the open
        // modal (the "stuck" bug). A *forced* click bypasses actionability to
        // simulate the tab still receiving the event; the modal must either
        // block it (URL stays on drive) or close cleanly — never strand the
        // user on another tab with the modal still mounted.
        await calendarTab.click({ force: true })
        await page.waitForTimeout(500)
        const stuck =
            page.url().includes('/calendar') && (await modal.isVisible().catch(() => false))
        expect(stuck, 'modal stranded over a switched tab').toBe(false)
    })
})
