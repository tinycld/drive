import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '../../../../tests/e2e/helpers'

test.describe('Drive — Browser', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive')
    })

    test('renders root folders', async ({ page }) => {
        await expect(page.getByText('Projects').first()).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText('Personal').first()).toBeVisible()
        await expect(page.getByText('Archive').first()).toBeVisible()
    })

    test('navigate into folder with single click (list view)', async ({ page }) => {
        await page.getByText('Projects').first().click()

        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText('Marketing').first()).toBeVisible()
        await expect(page.getByText('Engineering').first()).toBeVisible()
    })

    test('navigate into folder with single click (grid view)', async ({ page }) => {
        await expect(page.getByText('Projects').first()).toBeVisible({ timeout: 10_000 })
        await page.getByTestId('drive-view-grid').click()
        // Grid view groups under a "Folders" section heading
        await expect(page.getByText('Folders', { exact: true }).first()).toBeVisible({ timeout: 5_000 })

        await page.getByText('Projects').first().click()

        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })
    })

    test('breadcrumb navigation', async ({ page }) => {
        // Navigate into Projects > Engineering using single clicks
        await page.getByText('Projects').first().click()
        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })

        await page.getByText('Engineering').first().click()
        await expect(page.getByText('API Documentation').first()).toBeVisible({ timeout: 10_000 })

        const myFiles = page.getByText('My Files')
        await myFiles.first().click()
        await expect(page.getByText('Projects').first()).toBeVisible({ timeout: 10_000 })
    })

    test('clicking a single file does not replace the breadcrumb header', async ({ page }) => {
        // Open Projects > Engineering to find a known file
        await page.getByText('Projects').first().click()
        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })
        await page.getByText('Engineering').first().click()
        const fileRow = page.getByText('Architecture Overview.docx').first()
        await expect(fileRow).toBeVisible({ timeout: 10_000 })

        // Single-click selects the file; the toolbar must keep the
        // breadcrumb / folder-actions visible instead of swapping in the
        // selection toolbar (which used to render an orphaned X + filename).
        await fileRow.click()

        // The folder-action "New folder" button is part of the normal
        // toolbar; it disappears when the selection toolbar takes over.
        await expect(page.getByRole('button', { name: 'New folder' })).toBeVisible()
    })

    test('selection toolbar appears only after multi-select', async ({ page }) => {
        await page.getByText('Projects').first().click()
        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })
        await page.getByText('Engineering').first().click()
        await expect(page.getByText('Architecture Overview.docx').first()).toBeVisible({ timeout: 10_000 })

        // Cmd/ctrl-click two files to build a multi-selection
        const first = page.getByText('Architecture Overview.docx').first()
        const second = page.getByText('System Diagram.png').first()
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
        await first.click({ modifiers: [modifier] })
        await second.click({ modifiers: [modifier] })

        // The selection toolbar should now appear with a "2 selected" / "2 items" label
        await expect(page.getByText(/2 selected|2 items/)).toBeVisible({ timeout: 5_000 })
    })

    test('sidebar starred section', async ({ page }) => {
        // Click Starred in sidebar
        await page.getByText('Starred', { exact: true }).click()
        // Wait for the view to load
        await page.waitForTimeout(1000)
        // Navigate back
        await page.getByText('My Files').first().click()
        await expect(page.getByText('Projects').first()).toBeVisible({ timeout: 10_000 })
    })

    test('storage indicator shows usage', async ({ page }) => {
        await expect(page.getByText(/GB of 15 GB used/)).toBeVisible()
    })
})

test.describe('Drive — Mobile', () => {
    test.use({ viewport: { width: 400, height: 800 } })

    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive')
    })

    test('shows back button at the first folder level', async ({ page }) => {
        await expect(page.getByText('Projects').first()).toBeVisible({ timeout: 10_000 })

        // Tap into a top-level folder. On mobile breakpoints the toolbar
        // collapses to title + back button; we should see one immediately
        // because we are now one level deep.
        await page.getByText('Projects').first().click()
        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })

        const backButton = page.getByRole('button', { name: 'Go up' })
        await expect(backButton).toBeVisible()

        // Tapping back should return us to "My Files" root.
        await backButton.click()
        await expect(page.getByText('My Files', { exact: true }).first()).toBeVisible({ timeout: 5_000 })
        await expect(page.getByText('Projects').first()).toBeVisible()
    })

    test('back button walks up nested folders', async ({ page }) => {
        await page.getByText('Projects').first().click()
        await expect(page.getByText('Engineering').first()).toBeVisible({ timeout: 10_000 })
        await page.getByText('Engineering').first().click()
        await expect(page.getByText('Architecture Overview.docx').first()).toBeVisible({ timeout: 10_000 })

        const backButton = page.getByRole('button', { name: 'Go up' })
        await backButton.click()
        // Back to Projects — should see siblings of Engineering
        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })

        // Still inside a folder (Projects), so back should still be there
        await expect(page.getByRole('button', { name: 'Go up' })).toBeVisible()
        await page.getByRole('button', { name: 'Go up' }).click()
        await expect(page.getByText('Personal').first()).toBeVisible({ timeout: 10_000 })
    })
})
