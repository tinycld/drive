import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { dismissErrorOverlay, ensureListView, revealDriveRow } from './helpers'

// On a desktop-wide window the details panel sits beside the listing, and a
// plain single click shows the clicked item in it. Reads seeded root files
// only; nothing is created or changed. Other specs add folders at the root,
// which sort first, so each row is revealed through search.

const closeButton = (page: Page) => page.getByLabel('Close details panel')

test.describe('Drive — details panel', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)
        await ensureListView(page)
    })

    test('a single click shows the item beside the listing', async ({ page }) => {
        const first = await revealDriveRow(page, 'analytics.js')
        await first.click()
        await expect(closeButton(page)).toBeVisible()
        await expect(page.getByText('text/javascript')).toBeVisible()
        const panelBox = await page.getByTestId('drive-detail-panel').boundingBox()
        const rowBox = await first.boundingBox()
        expect(panelBox && rowBox && panelBox.x >= rowBox.x + rowBox.width - 1).toBe(true)

        // The panel is not modal: the search box and the listing stay usable,
        // and the panel follows the selection.
        const second = await revealDriveRow(page, 'Annual Report 2025.pdf')
        await second.click()
        await expect(page.getByText('application/pdf')).toBeVisible()
        await expect(closeButton(page)).toHaveCount(1)

        await closeButton(page).click()
        await expect(closeButton(page)).toHaveCount(0)
    })

    test('a double click opens the file without the panel', async ({ page }) => {
        const row = await revealDriveRow(page, 'analytics.js')
        await row.dblclick()
        await expect(page.getByText('Cannot preview this file')).toBeVisible()
        // Past the double-click window the panel still has not opened.
        await page.waitForTimeout(600)
        await expect(closeButton(page)).toHaveCount(0)
        await page.keyboard.press('Escape')
    })

    test('a ⌘-click extends the selection without opening the panel', async ({ page }) => {
        const row = await revealDriveRow(page, 'analytics.js')
        await row.click({ modifiers: ['Meta'] })
        await page.waitForTimeout(600)
        await expect(closeButton(page)).toHaveCount(0)
    })
})
