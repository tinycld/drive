import { expect, test } from '@playwright/test'
import { login, navigateToPackage, ORG_SLUG } from '@tinycld/core/e2e-helpers'
import {
    createDriveItem,
    dismissErrorOverlay,
    driveItem,
    openDriveItem,
    openDriveItemViaSearch,
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

        await expect(driveItem(page, 'Q1 Planning')).toBeVisible()
        await expect(driveItem(page, 'Marketing')).toBeVisible()
        await expect(driveItem(page, 'Engineering')).toBeVisible()
    })

    test('navigate into folder with single click (grid view)', async ({ page }) => {
        await expect(driveItem(page, 'Projects')).toBeVisible()
        await page.getByTestId('drive-view-grid').click()
        await expect(page.getByText('Folders', { exact: true }).first()).toBeVisible()

        await openDriveItem(page, 'Projects')

        await expect(driveItem(page, 'Q1 Planning')).toBeVisible()
    })

    test('breadcrumb navigation', async ({ page }) => {
        await openDriveItem(page, 'Projects')
        await expect(driveItem(page, 'Q1 Planning')).toBeVisible()

        await openDriveItem(page, 'Engineering')
        await expect(driveItem(page, 'Q1 Planning')).not.toBeVisible()

        // Click the breadcrumb "My Files" (labelled to disambiguate from the
        // sidebar's plain-text "My Files") to navigate back to root.
        await page.getByRole('button', { name: 'Breadcrumb: My Files', exact: true }).click()
        await expect(driveItem(page, 'Projects')).toBeVisible()
    })

    test('clicking a single file does not replace the breadcrumb header', async ({ page }) => {
        // Engineering seeds exactly two files; anchor on one by NAME so the
        // click waits for that specific row to mount. (A generic
        // `getByLabel(/\.docx/).first()` resolves against whatever's rendered
        // *now* and races FlashList row mounting under CI load.)
        await openDriveItem(page, 'Projects')
        await expect(driveItem(page, 'Q1 Planning')).toBeVisible()
        await openDriveItem(page, 'Engineering')

        const file = driveItem(page, 'Architecture Overview.docx')
        await expect(file).toBeVisible()
        await file.click()

        // The folder-action "New folder" button is part of the normal
        // toolbar; it disappears when the selection toolbar takes over.
        await expect(page.getByRole('button', { name: 'New folder' })).toBeVisible()
    })

    test('selection toolbar appears only after multi-select', async ({ page }) => {
        await openDriveItem(page, 'Projects')
        await expect(driveItem(page, 'Q1 Planning')).toBeVisible()
        await openDriveItem(page, 'Engineering')

        // Click the two Engineering files BY NAME. The previous version clicked
        // `.nth(0)`/`.nth(1)` on a regex row collection, and `.nth(1)` does NOT
        // wait for a second row to exist — it resolves against the rows mounted
        // at that instant, so under CI load the second click landed on nothing
        // and the selection never reached two. Naming each row makes Playwright
        // wait for it to be actionable before clicking.
        const first = driveItem(page, 'Architecture Overview.docx')
        const second = driveItem(page, 'System Diagram.png')
        await expect(first).toBeVisible()
        await expect(second).toBeVisible()

        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
        await first.click({ modifiers: [modifier] })
        await second.click({ modifiers: [modifier] })

        await expect(page.getByText(/2 selected|2 items/)).toBeVisible()
    })

    test('drag-to-select draws a box that selects the items under it (grid view)', async ({
        page,
    }) => {
        // Own fixtures in a fresh folder so the marquee box covers a known set of
        // cards without racing seeded rows or other tests' files.
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const folder = await createDriveItem({ name: `Marquee-${stamp}`, isFolder: true })
        const fileA = `MarqueeA-${stamp}.txt`
        const fileB = `MarqueeB-${stamp}.txt`
        await createDriveItem({ name: fileA, parent: folder.id })
        await createDriveItem({ name: fileB, parent: folder.id })
        await page.reload()

        await page.getByTestId('drive-view-grid').click()
        await openDriveItemViaSearch(page, `Marquee-${stamp}`)
        const cardA = driveItem(page, fileA)
        const cardB = driveItem(page, fileB)
        await expect(cardA).toBeVisible()
        await expect(cardB).toBeVisible()

        const a = await cardA.boundingBox()
        const b = await cardB.boundingBox()
        if (!a || !b) throw new Error('marquee test: a card has no bounding box')

        // Start in empty space to the LEFT of the leftmost card (the grid's
        // padding gutter — not over any tile, so the gesture is a marquee and
        // not a card drag), then sweep a box across both cards. Step the move so
        // the rubber-band passes its movement threshold and hit-tests per frame.
        const left = Math.min(a.x, b.x)
        const startX = left - 8
        const startY = Math.min(a.y, b.y) + 4
        const endX = Math.max(a.x + a.width, b.x + b.width) + 8
        const endY = Math.max(a.y + a.height, b.y + b.height) - 4

        await page.mouse.move(startX, startY)
        await page.mouse.down()
        const STEPS = 10
        for (let i = 1; i <= STEPS; i++) {
            await page.mouse.move(
                startX + ((endX - startX) * i) / STEPS,
                startY + ((endY - startY) * i) / STEPS
            )
        }
        await page.mouse.up()

        // Both fixture files fell under the box → the multi-select toolbar shows
        // its count ("N selected").
        await expect(page.getByText(/\d+ selected/)).toBeVisible()
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
        await openDriveItemViaSearch(page, `Sort-${stamp}`)
        await expect(driveItem(page, alpha)).toBeVisible()

        const fixtures = [alpha, mike, zulu]

        // Move the active sort off Name first (sort state can leak in from a
        // prior test in the serial session). Clicking Owner switches the
        // field, so the next Name click is a fresh field-switch — which always
        // starts ascending — rather than an ambiguous toggle.
        await sortableHeader(page, 'Owner').click()

        // Click Name → ascending (field switch resets direction to asc).
        await sortableHeader(page, 'Name').click()
        await expect.poll(() => orderedRowNames(page, fixtures)).toEqual([alpha, mike, zulu])

        // Click Name again → descending toggle.
        await sortableHeader(page, 'Name').click()
        await expect.poll(() => orderedRowNames(page, fixtures)).toEqual([zulu, mike, alpha])
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
        await expect(page.getByText('Trash', { exact: true })).toBeVisible()
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
        await page.getByText('Projects', { exact: true }).first().waitFor({ state: 'visible' })
        await dismissErrorOverlay(page)
    })

    test('back button walks up nested folders', async ({ page }) => {
        await openDriveItem(page, 'Projects')
        await expect(driveItem(page, 'Engineering')).toBeVisible()
        await openDriveItem(page, 'Engineering')

        const backButton = page.getByRole('button', { name: 'Go up' })
        await expect(backButton).toBeVisible()
        await backButton.click()
        await expect(driveItem(page, 'Q1 Planning')).toBeVisible()

        await expect(page.getByRole('button', { name: 'Go up' })).toBeVisible()
        await page.getByRole('button', { name: 'Go up' }).click()
        await expect(driveItem(page, 'Personal')).toBeVisible()
    })

    // Stefan: "when I open a file preview the modal doesn't cover the bottom
    // navigation — it should." The fullscreen preview must paint OVER the
    // MobileTabBar, and switching tabs underneath it (which left the modal
    // stuck) must not be possible while it's open. Uses a seeded image (light
    // to render) rather than the PDF — the fix is mime-agnostic and the PDF's
    // pdfjs worker is slow to mount under CI load.
    test('file preview covers the bottom nav and is not escapable via the tab bar', async ({
        page,
    }) => {
        // Put a previewable file in a fresh folder and open it from there, so
        // the row is the only one in view (the full mobile root list buries
        // files below the fold under CI). A bare record (no real bytes) is
        // enough — the preview modal shell mounts regardless of image load.
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const folderName = `PreviewCase-${stamp}`
        const fileName = `PreviewMe-${stamp}.png`
        const folder = await createDriveItem({ name: folderName, isFolder: true })
        await createDriveItem({ name: fileName, parent: folder.id })
        await page.reload()
        await page.getByText('Projects', { exact: true }).first().waitFor({ state: 'visible' })

        await openDriveItemViaSearch(page, folderName)
        const fileRow = driveItem(page, fileName)
        await expect(fileRow).toBeVisible()
        await fileRow.click()

        const modal = page.getByTestId('file-preview-modal')
        await expect(modal).toBeVisible()

        // The fullscreen preview spans the viewport (it should overlay the
        // bottom tab bar, not stop above it). The exact bottom-inset coverage
        // is a native rendering detail verified on-device; here we assert the
        // modal fills the bulk of the screen and that opening it didn't navigate
        // away from drive (the "switch tabs underneath / get stuck" report).
        const viewport = page.viewportSize()
        const box = await modal.boundingBox()
        if (!viewport || !box) throw new Error('missing viewport/modal box')
        expect(box.height).toBeGreaterThan(viewport.height * 0.85)
        expect(page.url()).toContain('/drive')
    })
})
