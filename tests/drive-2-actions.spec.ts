import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '../../../../tests/e2e/helpers'
import { createDriveItem, driveItem, escapeRegex, openDriveItem } from './helpers'

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
        await navigateToPackage(page, 'drive')
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

    test('selecting a file reveals Rename and Delete in the toolbar', async ({ page }) => {
        const { folderName, fileName } = await setupFixtureFile('SelectActions')
        await page.reload()

        await openDriveItem(page, folderName)
        const fileRow = driveItem(page, fileName)
        await expect(fileRow).toBeVisible({ timeout: 10_000 })

        await expect(page.getByLabel('Rename', { exact: true })).toHaveCount(0)
        await expect(page.getByLabel('Delete', { exact: true })).toHaveCount(0)

        await fileRow.click()
        await expect(page.getByLabel('Rename', { exact: true })).toBeVisible({ timeout: 10_000 })
        await expect(page.getByLabel('Delete', { exact: true })).toBeVisible()
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
        await page.getByLabel('Delete', { exact: true }).click({ timeout: 10_000 })
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
        await page.getByLabel('Delete', { exact: true }).click({ timeout: 10_000 })
        await page
            .getByRole('button', { name: /move to trash/i })
            .or(page.getByRole('button', { name: /confirm/i }))
            .or(page.getByRole('button', { name: /trash/i }).last())
            .click()

        await expect(driveItem(page, fileName)).toHaveCount(0, { timeout: 10_000 })

        await page.getByText('Trash').click()
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
        await page.getByLabel('Delete', { exact: true }).click({ timeout: 10_000 })
        await page.getByRole('button', { name: /move to trash/i }).click()

        await page.getByText('Trash').click()
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

    test('detail panel opens via Info toolbar and closes via X and backdrop', async ({ page }) => {
        // Regression: detail panel was rebuilt on top of the core Drawer
        // component. The first iteration wired an explicit `onPress` on
        // <DrawerCloseButton>, which Gluestack's ModalCloseButton spreads
        // AFTER its built-in `onPress={handleClose}` — so our onPress
        // overrode the close path entirely and neither the X button nor
        // the backdrop dismissed the drawer. Cover both dismiss paths
        // here so we notice if the wiring drifts again.
        const { folderName, fileName } = await setupFixtureFile('Detail')
        await page.reload()

        await openDriveItem(page, folderName)
        const file = driveItem(page, fileName)
        await expect(file).toBeVisible({ timeout: 10_000 })

        await file.click()
        // ToolbarIconButton renders as a real <button> on web; the
        // row's hover-actions render the same Info icon as a
        // <Pressable> (div role=button). Scope by getByRole('button')
        // so the locator only matches the toolbar's real button.
        const infoToolbar = page.getByRole('button', { name: 'Info', exact: true })
        await infoToolbar.click({ timeout: 10_000 })

        const closeBtn = page.getByLabel('Close details panel', { exact: true })
        await expect(closeBtn).toBeVisible({ timeout: 5_000 })

        // Dismiss via the X.
        await closeBtn.click()
        await expect(closeBtn).not.toBeVisible({ timeout: 5_000 })

        // Re-open, then dismiss via backdrop click. The backdrop fills
        // the viewport behind the right-anchored drawer; clicking near
        // the left edge lands on it, not the drawer content.
        await infoToolbar.click({ timeout: 10_000 })
        await expect(closeBtn).toBeVisible({ timeout: 5_000 })

        await page.locator('body').click({ position: { x: 10, y: 200 } })
        await expect(closeBtn).not.toBeVisible({ timeout: 5_000 })
    })
})
