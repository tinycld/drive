import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { dismissErrorOverlay, ensureListView, revealDriveRow } from './helpers'

// Opens version history from the details panel and comes back. Reads a
// seeded root file only; nothing is created or changed.

const versionList = (page: Page) => page.getByRole('list', { name: 'Versions' })

test.describe('Drive — version history', () => {
    test('opens from the details panel and returns to the listing', async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)
        await ensureListView(page)

        const row = await revealDriveRow(page, 'analytics.js')
        await row.click()
        await page.getByTestId('drive-detail-panel').getByText('Versions', { exact: true }).click()
        await page.getByRole('button', { name: 'Open version history' }).click()

        await expect(versionList(page)).toBeVisible()
        await expect(page.getByRole('heading', { name: 'analytics.js' })).toBeVisible()
        await expect(page.getByTestId('drive-detail-panel')).toHaveCount(0)

        await page.getByRole('button', { name: 'Back' }).click()
        await expect(versionList(page)).toHaveCount(0)
        // Back to the listing, search kept; navigation clears the selection,
        // so the details panel is closed.
        await expect(page.getByRole('textbox', { name: 'Search in Files' })).toHaveValue(
            'analytics.js'
        )
        await expect(page.getByRole('heading', { name: 'analytics.js' })).toHaveCount(0)
    })
})
