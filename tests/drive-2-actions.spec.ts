import { expect, type Page, test } from '@playwright/test'
import { clickSidebarItem, login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    createDriveItem,
    driveItem,
    escapeRegex,
    openDriveItem,
    uploadFileAsDriveItem,
} from './helpers'

// Opens a file row's detail panel via its Info hover-action. The Info
// affordance lives in the row's RowHoverActions layer (list view only),
// mounted but kept at opacity:0 / pointerEvents:none until the row is
// hovered — so a bare click never lands. Hover the row first to make the
// action interactive, then click it. The caller must be in *list* view
// (grid cards have no hover actions) and the folder should hold a single
// file so the page-level Info action is unambiguous.
async function openDetailPanelViaInfo(
    _page: Page,
    row: import('@playwright/test').Locator
): Promise<void> {
    await row.hover()
    // RowHoverActions' HoverAction renders as a labeled Pressable that RN
    // Web emits as a div (role=generic, not button) — so target it by its
    // accessible label, not by role. Scope to the hovered row; hovering
    // flips the layer's pointerEvents to auto, making the click land.
    await row.getByLabel('Info', { exact: true }).first().click({ timeout: 10_000 })
}

// Force list view. The view mode is a persisted user preference, so a
// prior test (drive-1-browser switches to grid) leaks its choice into
// later specs in the same serial session. Tests that depend on list-only
// affordances (the row Info hover-action) must assert the precondition
// rather than inherit ambient state. Idempotent: clicking when already in
// list view is a no-op.
async function ensureListView(page: Page): Promise<void> {
    await page.getByTestId('drive-view-list').click()
}

// Each destructive test creates its own per-test folder + fixture file via
// the PB REST API, then operates on that. We don't read or mutate seeded
// files (Profile Photo.jpg, Logo Variants.png, Product Roadmap 2026.docx)
// because drive-1-browser reads the same seed structure in parallel.
//
// The tests still run serially within this file because they share login.

async function setupFixtureFile(name: string): Promise<{ folderName: string; fileName: string }> {
    const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const folderName = `Drive2-${stamp}`
    const fileName = `${name}-${stamp}.txt`
    const folder = await createDriveItem({ name: folderName, isFolder: true })
    await createDriveItem({ name: fileName, parent: folder.id })
    return { folderName, fileName }
}

test.describe('Drive — Actions', () => {
    test.describe.configure({ mode: 'serial' })
    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
    })

    test('search files', async ({ page }) => {
        const { fileName } = await setupFixtureFile('Search')
        await page.reload()

        const searchInput = page.getByPlaceholder('Search in Files')
        await searchInput.fill(fileName)
        await expect(driveItem(page, fileName)).toBeVisible({ timeout: 10_000 })

        await searchInput.clear()
        await expect(driveItem(page, 'Projects')).toBeVisible({ timeout: 10_000 })
    })

    // Regression: search-result rows for files not in the loaded folder view
    // used to show "Invalid Date" because the search API returned no date.
    // The API now returns `updated`; assert the row shows a real date and never
    // the literal "Invalid Date".
    test('search results show a real date, not "Invalid Date"', async ({ page }) => {
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const fileName = `DatedSearch-${stamp}.txt`
        await createDriveItem({ name: fileName })
        await page.reload()

        await page.getByPlaceholder('Search in Files').fill(fileName)
        const row = driveItem(page, fileName)
        await expect(row).toBeVisible({ timeout: 10_000 })

        // No row may render the literal "Invalid Date" — this is the core
        // assertion (search rows used to show it because the API returned no
        // date). The row's accessibility label is "<name> <date>", so a real
        // formatted date must appear in it.
        await expect(page.getByText('Invalid Date')).toHaveCount(0)
        const label = (await row.getAttribute('aria-label')) ?? ''
        expect(label).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}/)
    })

    test('selecting a file reveals Rename and Delete in the toolbar', async ({ page }) => {
        const { folderName, fileName } = await setupFixtureFile('SelectActions')
        await page.reload()

        await openDriveItem(page, folderName)
        const fileRow = driveItem(page, fileName)
        await expect(fileRow).toBeVisible({ timeout: 10_000 })

        // Scope to role=button so we match only the toolbar's real <button>
        // actions. The row hover-actions render Delete as a labeled div
        // (role=generic), so getByLabel('Delete') also matches those even
        // when nothing is selected — making the "absent before selection"
        // assertion find the hover-action Delete and fail.
        await expect(page.getByRole('button', { name: 'Rename', exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)

        await fileRow.click()
        await expect(page.getByRole('button', { name: 'Rename', exact: true })).toBeVisible({
            timeout: 10_000,
        })
        await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
    })

    test('rename selected file from toolbar', async ({ page }) => {
        const { folderName, fileName } = await setupFixtureFile('Edit')
        await page.reload()

        await openDriveItem(page, folderName)
        const row = driveItem(page, new RegExp(`^${escapeRegex(fileName)} `))
        await row.click()
        await page.getByLabel('Rename', { exact: true }).click({ timeout: 10_000 })

        const newName = `Renamed-${Date.now()}.txt`
        const input = page.getByRole('textbox').last()
        await input.clear()
        await input.fill(newName)

        await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click()

        await expect(driveItem(page, new RegExp(`^${escapeRegex(newName)} `))).toBeVisible({
            timeout: 10_000,
        })
    })

    test('move selected file to trash from toolbar', async ({ page }) => {
        const { folderName, fileName } = await setupFixtureFile('Trash')
        await page.reload()

        await openDriveItem(page, folderName)
        const file = driveItem(page, fileName)
        await expect(file).toBeVisible({ timeout: 10_000 })

        await file.click()
        await page.getByRole('button', { name: 'Delete', exact: true }).click({ timeout: 10_000 })
        await page.getByRole('button', { name: /move to trash/i }).click()

        await expect(driveItem(page, fileName)).toHaveCount(0, { timeout: 10_000 })
    })

    test('restore from trash', async ({ page }) => {
        const { folderName, fileName } = await setupFixtureFile('Bring')
        await page.reload()

        await openDriveItem(page, folderName)
        const file = driveItem(page, fileName)
        await expect(file).toBeVisible({ timeout: 10_000 })

        await file.click()
        await page.getByRole('button', { name: 'Delete', exact: true }).click({ timeout: 10_000 })
        await page
            .getByRole('button', { name: /move to trash/i })
            .or(page.getByRole('button', { name: /confirm/i }))
            .or(page.getByRole('button', { name: /trash/i }).last())
            .click()

        await expect(driveItem(page, fileName)).toHaveCount(0, { timeout: 10_000 })

        await clickSidebarItem(page, 'Trash')
        const trashedRow = driveItem(page, fileName)
        await expect(trashedRow).toBeVisible({ timeout: 10_000 })

        await trashedRow.click()
        await page.getByLabel('Restore', { exact: true }).click()

        await expect(driveItem(page, fileName)).toHaveCount(0, { timeout: 10_000 })
    })

    test('permanently delete from trash', async ({ page }) => {
        const { folderName, fileName } = await setupFixtureFile('Perma')
        await page.reload()

        await openDriveItem(page, folderName)
        const file = driveItem(page, fileName)
        await expect(file).toBeVisible({ timeout: 10_000 })

        await file.click()
        await page.getByRole('button', { name: 'Delete', exact: true }).click({ timeout: 10_000 })
        await page.getByRole('button', { name: /move to trash/i }).click()

        await clickSidebarItem(page, 'Trash')
        const trashed = driveItem(page, fileName)
        await expect(trashed).toBeVisible({ timeout: 10_000 })

        await trashed.click()
        await page.getByLabel('Delete permanently', { exact: true }).click({ timeout: 10_000 })
        await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click()

        await expect(driveItem(page, fileName)).toHaveCount(0, { timeout: 10_000 })
    })

    test('download folder via context menu', async ({ page }) => {
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const folderName = `Download-${stamp}`
        await createDriveItem({ name: folderName, isFolder: true })
        await page.reload()

        await driveItem(page, folderName).click({ button: 'right' })

        const downloadMenuItem = page.getByText('Download', { exact: true })
        await expect(downloadMenuItem).toBeVisible({ timeout: 5_000 })

        const tokenRequest = page.waitForResponse(
            resp => resp.url().includes('/api/drive/download-token') && resp.status() === 200
        )
        const downloadPromise = page.waitForEvent('download')

        await downloadMenuItem.dispatchEvent('click')

        const tokenResp = await tokenRequest
        const tokenBody = await tokenResp.json()
        expect(tokenBody.token).toBeTruthy()
        expect(tokenBody.url).toContain('/api/drive/download-folder?token=')

        const download = await downloadPromise
        expect(download.suggestedFilename()).toBe(`${folderName}.zip`)
    })

    // Regression for the mobile-download bug: downloadItem used to early-return
    // on native and only worked via inline web-only code. It now routes through
    // the shared downloadFile() helper (web anchor + native cache/share). On web
    // we assert a real browser download fires with the file's own name.
    test('download file via context menu', async ({ page }) => {
        const fs = await import('node:fs')
        const os = await import('node:os')
        const path = await import('node:path')
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const fileName = `DownloadFile-${stamp}.pdf`
        const fixturePath = path.join(os.tmpdir(), fileName)
        // Minimal valid-enough PDF bytes; content is irrelevant to the download path.
        fs.writeFileSync(fixturePath, '%PDF-1.4\n%test\n')
        await uploadFileAsDriveItem({
            fixturePath,
            name: fileName,
            mimeType: 'application/pdf',
        })
        await page.reload()

        // The file lands at root among the long seeded list; filter to it via
        // search so its row is on-screen (not buried below the fold).
        await page.getByPlaceholder('Search in Files').fill(fileName)
        await expect(driveItem(page, fileName)).toBeVisible({ timeout: 10_000 })
        await driveItem(page, fileName).click({ button: 'right' })

        const downloadMenuItem = page.getByText('Download', { exact: true })
        await expect(downloadMenuItem).toBeVisible({ timeout: 5_000 })

        const downloadPromise = page.waitForEvent('download')
        await downloadMenuItem.dispatchEvent('click')

        // A real browser download must fire (previously the file path no-op'd on
        // native and this asserts the web path still works after the refactor).
        // The server normalizes the stored filename, so assert the extension
        // rather than the exact display name.
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.pdf$/)
    })

    // Repro for "creating a new folder doesn't update the list after saving":
    // drive a folder through the real New folder dialog (not the REST helper)
    // and assert the row appears without a manual refresh.
    test('creating a folder via the dialog shows it in the list', async ({ page }) => {
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const folderName = `NewViaDialog-${stamp}`

        await page.getByRole('button', { name: 'New folder' }).click()

        const nameInput = page.getByPlaceholder('Untitled folder')
        await expect(nameInput).toBeVisible({ timeout: 5_000 })
        await nameInput.fill(folderName)
        await page.getByRole('button', { name: 'Create' }).click()

        // The new folder must appear in the list reactively (no page.reload()).
        await expect(driveItem(page, folderName)).toBeVisible({ timeout: 10_000 })
    })

    // Move-to-folder flow. The mobile affordance is a swipe action (native
    // only, not rendered on web), but it reuses this exact dialog + moveItem
    // mutation that the desktop right-click "Move" triggers — so this e2e
    // guards the shared flow the mobile swipe depends on.
    test('move a file into a folder via the move dialog', async ({ page }) => {
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const folderName = `MoveTarget-${stamp}`
        const fileName = `MoveMe-${stamp}.txt`
        // The file lives in a fresh parent folder (so its row isn't buried in
        // the long seeded root list); the move target is a top-level folder so
        // it's a one-click pick in the dialog tree (no expansion needed).
        const parent = await createDriveItem({ name: `MoveCase-${stamp}`, isFolder: true })
        await createDriveItem({ name: folderName, isFolder: true })
        await createDriveItem({ name: fileName, parent: parent.id })
        await page.reload()

        await openDriveItem(page, `MoveCase-${stamp}`)
        await expect(driveItem(page, fileName)).toBeVisible({ timeout: 10_000 })
        await driveItem(page, fileName).click({ button: 'right' })

        const moveMenuItem = page.getByText('Move', { exact: true })
        await expect(moveMenuItem).toBeVisible({ timeout: 5_000 })
        await moveMenuItem.dispatchEvent('click')

        // The dialog lists folders; pick our top-level target then confirm.
        // Scope to the dialog — the folder name also appears in the sidebar tree.
        const dialog = page.getByTestId('choose-folder-dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })
        await dialog.getByText(folderName, { exact: true }).click()
        await dialog.getByText('Move here', { exact: true }).click()

        // The file leaves the current (MoveCase) folder...
        await expect(driveItem(page, fileName)).toHaveCount(0, { timeout: 10_000 })
        // ...and appears inside the target folder. Navigate there via the
        // sidebar folder tree (scoped to the sidebar to avoid the dialog/root
        // "My Files" ambiguity).
        const sidebar = page.getByTestId('package-sidebar-mounted')
        await sidebar.getByText(folderName, { exact: true }).click()
        await expect(driveItem(page, fileName)).toBeVisible({ timeout: 10_000 })
    })

    test('context menu closes when clicking outside it', async ({ page }) => {
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const folderName = `CtxMenu-${stamp}`
        await createDriveItem({ name: folderName, isFolder: true })
        await page.reload()

        await driveItem(page, folderName).click({ button: 'right' })
        await expect(page.getByText('Download', { exact: true })).toBeVisible({ timeout: 5_000 })

        await page.locator('body').click({ position: { x: 5, y: 5 } })

        await expect(page.getByText('Download', { exact: true })).not.toBeVisible({
            timeout: 5_000,
        })
    })

    test('detail panel opens via the Info hover action', async ({ page }) => {
        const { folderName, fileName } = await setupFixtureFile('Detail')
        await page.reload()

        // The Info hover-action only exists in list view; a prior spec may
        // have left grid view persisted.
        await ensureListView(page)
        await openDriveItem(page, folderName)
        const file = driveItem(page, fileName)
        await expect(file).toBeVisible({ timeout: 10_000 })

        // The detail panel is opened from the row's Info hover-action, not
        // the selection toolbar (a single file's toolbar shows only Rename
        // and Delete). openDetailPanelViaInfo hovers the row to make the
        // action interactive, then clicks it.
        await openDetailPanelViaInfo(page, file)
        await expect(page.getByLabel('Close details panel', { exact: true })).toBeVisible({
            timeout: 5_000,
        })
    })

    // The detail panel dismisses via the X button and via a backdrop
    // click. Both close paths now work under Playwright: the shared Drawer
    // unmounts the gluestack overlay synchronously on close (it no longer
    // relies on the broken RN-Web Animated exit handshake), so onClose
    // takes effect immediately and no lingering overlay swallows the press.
    test('detail panel closes via X and backdrop', async ({ page }) => {
        const { folderName, fileName } = await setupFixtureFile('DetailClose')
        await page.reload()

        // The Info hover-action only exists in list view; a prior spec may
        // have left grid view persisted.
        await ensureListView(page)
        await openDriveItem(page, folderName)
        const file = driveItem(page, fileName)
        await expect(file).toBeVisible({ timeout: 10_000 })

        await openDetailPanelViaInfo(page, file)
        const closeBtn = page.getByLabel('Close details panel', { exact: true })
        await expect(closeBtn).toBeVisible({ timeout: 5_000 })

        // Dismiss via the X.
        await closeBtn.click()
        await expect(closeBtn).not.toBeVisible({ timeout: 5_000 })

        // Re-open, then dismiss via backdrop click. The backdrop fills
        // the viewport behind the right-anchored drawer; clicking near
        // the left edge lands on it, not the drawer content.
        await openDetailPanelViaInfo(page, file)
        await expect(closeBtn).toBeVisible({ timeout: 5_000 })

        await page.locator('body').click({ position: { x: 10, y: 200 } })
        await expect(closeBtn).not.toBeVisible({ timeout: 5_000 })
    })
})
