import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '../../../../tests/e2e/helpers'

test.describe('Drive — Actions', () => {
    test.describe.configure({ mode: 'serial' })
    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive')
    })

    test('new menu is visible in sidebar', async ({ page }) => {
        // The "New" button is in the sidebar with a Plus icon
        await expect(page.getByText('New', { exact: true })).toBeVisible()
    })

    test('search files', async ({ page }) => {
        const searchInput = page.getByPlaceholder('Search in Files')
        await searchInput.fill('Roadmap')

        await expect(page.getByText('Product Roadmap 2026.docx').first()).toBeVisible({
            timeout: 10_000,
        })

        await searchInput.clear()
        await expect(page.getByText('Projects').first()).toBeVisible({ timeout: 10_000 })
    })

    test('selecting a file reveals Rename and Delete in the toolbar', async ({ page }) => {
        await page.getByText('Projects').first().click()
        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })

        await page.getByText('Q1 Planning').first().click()
        await expect(page.getByText('Product Roadmap 2026.docx').first()).toBeVisible({
            timeout: 10_000,
        })

        // Without a selection, the toolbar shouldn't expose item-scoped actions.
        await expect(page.getByLabel('Rename')).toHaveCount(0)
        await expect(page.getByLabel('Delete')).toHaveCount(0)

        // Selecting the file should bring the per-item actions into the toolbar.
        await page.getByText('Product Roadmap 2026.docx').first().click()

        await expect(page.getByLabel('Rename')).toBeVisible({ timeout: 10_000 })
        await expect(page.getByLabel('Delete')).toBeVisible()
    })

    test('rename selected file from toolbar', async ({ page }) => {
        await page.getByText('Projects').first().click()
        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })
        await page.getByText('Q1 Planning').first().click()

        await page.getByText('Roadmap').first().click()
        await page.getByLabel('Rename').click({ timeout: 10_000 })

        const newName = `Renamed Deck ${Date.now()}.pptx`
        const input = page.getByRole('textbox').last()
        await input.clear()
        await input.fill(newName)

        await page.getByRole('button', { name: 'Rename' }).click()

        await expect(page.getByText(newName).first()).toBeVisible({ timeout: 10_000 })
    })

    test('move selected file to trash from toolbar', async ({ page }) => {
        await page.getByText('Personal').first().click()
        await expect(page.getByText('Profile Photo.jpg').first()).toBeVisible({ timeout: 10_000 })

        await page.getByText('Profile Photo.jpg').first().click()
        await page.getByLabel('Delete').click({ timeout: 10_000 })

        await page.getByRole('button', { name: /move to trash/i }).click()

        await expect(page.getByText('Profile Photo.jpg')).not.toBeVisible({ timeout: 10_000 })
    })

    test('restore from trash', async ({ page }) => {
        // Trash a file via the toolbar after selecting
        await page.getByText('Archive').first().click()
        await expect(page.getByText('Client Proposal (Old).docx').first()).toBeVisible({
            timeout: 10_000,
        })

        await page.getByText('Client Proposal (Old).docx').first().click()
        await page.getByLabel('Delete').click({ timeout: 10_000 })

        const trashConfirm = page
            .getByRole('button', { name: /move to trash/i })
            .or(page.getByRole('button', { name: /confirm/i }))
            .or(page.getByRole('button', { name: /trash/i }).last())
        await trashConfirm.click()

        await expect(page.getByText('Client Proposal (Old).docx')).not.toBeVisible({
            timeout: 10_000,
        })

        // Trash sidebar entry — selecting in trash still shows the selection
        // toolbar (it owns Restore / Delete-permanently which aren't on rows).
        await page.getByText('Trash').click()
        await expect(page.getByText('Client Proposal (Old).docx').first()).toBeVisible({
            timeout: 10_000,
        })

        await page.getByText('Client Proposal (Old).docx').first().click()
        await page.getByLabel('Restore').click()

        await expect(page.getByText('Client Proposal (Old).docx')).not.toBeVisible({
            timeout: 10_000,
        })
    })

    test('download folder via context menu', async ({ page }) => {
        // Right-click the "Projects" folder row in the file list (not the sidebar)
        await page.getByRole('button', { name: /^Projects / }).click({ button: 'right' })

        // "Download" should be visible in the context menu for folders
        const downloadMenuItem = page.getByText('Download', { exact: true })
        await expect(downloadMenuItem).toBeVisible({ timeout: 5_000 })

        // Intercept the download-token request to verify it fires
        const tokenRequest = page.waitForResponse(
            (resp) => resp.url().includes('/api/drive/download-token') && resp.status() === 200
        )

        // Intercept the subsequent download so the browser doesn't actually save a file
        const downloadPromise = page.waitForEvent('download')

        // dispatchEvent bypasses HeroUI Menu overlay pointer interception
        await downloadMenuItem.dispatchEvent('click')

        const tokenResp = await tokenRequest
        const tokenBody = await tokenResp.json()
        expect(tokenBody.token).toBeTruthy()
        expect(tokenBody.url).toContain('/api/drive/download-folder?token=')

        const download = await downloadPromise
        expect(download.suggestedFilename()).toBe('Projects.zip')
    })

    test('permanently delete from trash', async ({ page }) => {
        await page.getByText('Projects').first().click()
        await expect(page.getByText('Marketing').first()).toBeVisible({ timeout: 10_000 })

        await page.getByText('Marketing').first().click()
        await expect(page.getByText('Logo Variants.png').first()).toBeVisible({
            timeout: 10_000,
        })

        await page.getByText('Logo Variants.png').first().click()
        await page.getByLabel('Delete').click({ timeout: 10_000 })
        await page.getByRole('button', { name: /move to trash/i }).click()

        await page.getByText('Trash').click()
        await expect(page.getByText('Logo Variants.png').first()).toBeVisible({
            timeout: 10_000,
        })

        // Trash mode keeps the single-selection toolbar so Delete-permanently
        // remains a one-click affordance once you've selected.
        await page.getByText('Logo Variants.png').first().click()
        await page.getByLabel('Delete permanently').click({ timeout: 10_000 })

        await page.getByRole('button', { name: 'Delete permanently' }).click()

        await expect(page.getByText('Logo Variants.png')).not.toBeVisible({
            timeout: 10_000,
        })
    })

    test('context menu closes when clicking outside it', async ({ page }) => {
        // Open context menu on a folder row.
        await page.getByRole('button', { name: /^Projects / }).click({ button: 'right' })
        await expect(page.getByText('Download', { exact: true })).toBeVisible({ timeout: 5_000 })

        // Click somewhere safely outside the menu — the toolbar's package
        // breadcrumb area is reliably outside the popup placement.
        await page.locator('body').click({ position: { x: 5, y: 5 } })

        // Menu should disappear; "Download" only exists as a menu entry on
        // folder rows here, so its absence is the dismissal signal.
        await expect(page.getByText('Download', { exact: true })).not.toBeVisible({
            timeout: 5_000,
        })
    })
})
