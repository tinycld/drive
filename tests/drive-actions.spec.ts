import { expect, test } from '@playwright/test'
import { login, navigateToAddon } from '../../../tests/e2e/helpers'

test.describe('Drive — Actions', () => {
    test.describe.configure({ mode: 'serial' })
    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToAddon(page, 'drive')
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

    test('select file shows toolbar with actions', async ({ page }) => {
        await page.getByText('Projects').first().dblclick()
        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })

        await page.getByText('Q1 Planning').first().dblclick()
        await expect(page.getByText('Product Roadmap 2026.docx').first()).toBeVisible({
            timeout: 10_000,
        })

        await page.getByText('Product Roadmap 2026.docx').first().click()

        await expect(page.getByLabel('Rename')).toBeVisible({ timeout: 10_000 })
        await expect(page.getByLabel('Download').first()).toBeVisible()
    })

    test('rename file', async ({ page }) => {
        await page.getByText('Projects').first().dblclick()
        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })
        await page.getByText('Q1 Planning').first().dblclick()

        await page.getByText('Roadmap').first().click()
        await page.getByLabel('Rename').click({ timeout: 10_000 })

        const newName = `Renamed Deck ${Date.now()}.pptx`
        const input = page.getByRole('textbox').last()
        await input.clear()
        await input.fill(newName)

        await page.getByRole('button', { name: 'Rename' }).click()

        await expect(page.getByText(newName).first()).toBeVisible({ timeout: 10_000 })
    })

    test('move file to trash', async ({ page }) => {
        await page.getByText('Personal').first().dblclick()
        await expect(page.getByText('Profile Photo.jpg').first()).toBeVisible({ timeout: 10_000 })

        await page.getByText('Profile Photo.jpg').first().click()
        await page.getByLabel('Trash').click({ timeout: 10_000 })

        // Confirm in the trash dialog
        await page.getByRole('button', { name: /move to trash/i }).click()

        await expect(page.getByText('Profile Photo.jpg')).not.toBeVisible({ timeout: 10_000 })
    })

    test('restore from trash', async ({ page }) => {
        // Trash a file first
        await page.getByText('Archive').first().dblclick()
        await expect(page.getByText('Client Proposal (Old).docx').first()).toBeVisible({
            timeout: 10_000,
        })

        await page.getByText('Client Proposal (Old).docx').first().click()
        await page.getByLabel('Trash').click({ timeout: 10_000 })
        // Confirm trash dialog
        const trashConfirm = page
            .getByRole('button', { name: /move to trash/i })
            .or(page.getByRole('button', { name: /confirm/i }))
            .or(page.getByRole('button', { name: /trash/i }).last())
        await trashConfirm.click()

        await expect(page.getByText('Client Proposal (Old).docx')).not.toBeVisible({
            timeout: 10_000,
        })

        // Navigate to Trash via sidebar
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
        // Right-click the "Projects" folder to open context menu
        await page.getByText('Projects').first().click({ button: 'right' })

        // "Download" should be visible in the context menu for folders
        const downloadMenuItem = page.getByText('Download', { exact: true })
        await expect(downloadMenuItem).toBeVisible({ timeout: 5_000 })

        // Intercept the download-token request to verify it fires
        const tokenRequest = page.waitForResponse(
            resp => resp.url().includes('/api/drive/download-token') && resp.status() === 200
        )

        // Intercept the subsequent download so the browser doesn't actually save a file
        const downloadPromise = page.waitForEvent('download')

        await downloadMenuItem.click()

        const tokenResp = await tokenRequest
        const tokenBody = await tokenResp.json()
        expect(tokenBody.token).toBeTruthy()
        expect(tokenBody.url).toContain('/api/drive/download-folder?token=')

        const download = await downloadPromise
        expect(download.suggestedFilename()).toBe('Projects.zip')
    })

    test('permanently delete from trash', async ({ page }) => {
        await page.getByText('Projects').first().dblclick()
        await expect(page.getByText('Marketing').first()).toBeVisible({ timeout: 10_000 })

        await page.getByText('Marketing').first().dblclick()
        await expect(page.getByText('Logo Variants.png').first()).toBeVisible({
            timeout: 10_000,
        })

        await page.getByText('Logo Variants.png').first().click()
        await page.getByLabel('Trash').click({ timeout: 10_000 })
        await page.getByRole('button', { name: /move to trash/i }).click()

        await page.getByText('Trash').click()
        await expect(page.getByText('Logo Variants.png').first()).toBeVisible({
            timeout: 10_000,
        })

        await page.getByText('Logo Variants.png').first().click()
        await page.getByLabel('Delete permanently').click({ timeout: 10_000 })

        await page.getByRole('button', { name: 'Delete permanently' }).click()

        await expect(page.getByText('Logo Variants.png')).not.toBeVisible({
            timeout: 10_000,
        })
    })
})
