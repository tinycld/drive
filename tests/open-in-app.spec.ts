import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { dismissErrorOverlay, revealDriveRow } from './helpers'

// Force list view. The view mode is a persisted user preference, so a
// prior test may have left grid view active. Tests that rely on dblclick
// to open files must be in list view (grid cards use the same gesture but
// the seeded root listing is virtualized — list view is the stable surface
// for these read-only open-in-app flows).
async function ensureListView(page: import('@playwright/test').Page): Promise<void> {
    await page.getByTestId('drive-view-list').click()
}

test.describe('Drive — Open in App', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)
        await ensureListView(page)
    })

    test('double-clicking a spreadsheet opens it in Calc', async ({ page }) => {
        const row = await revealDriveRow(page, 'Sample Spreadsheet.xlsx')
        await row.dblclick()
        await page.waitForURL(/\/calc\/[^/]+$/, { timeout: 30_000 })
    })

    test('double-clicking a document opens it in Text', async ({ page }) => {
        const row = await revealDriveRow(page, 'Sample Document.docx')
        await row.dblclick()
        await page.waitForURL(/\/text\/[^/]+$/, { timeout: 30_000 })
    })

    test('double-clicking an image opens the preview modal (no app)', async ({ page }) => {
        const row = await revealDriveRow(page, 'Hippo.jpg')
        await row.dblclick()
        await expect(page.getByTestId('file-preview-modal')).toBeVisible()
    })

    test('right-clicking a document still offers Preview', async ({ page }) => {
        const row = await revealDriveRow(page, 'Sample Document.docx')
        await row.click({ button: 'right' })
        await page.getByText('Preview', { exact: true }).click()
        await expect(page.getByTestId('file-preview-modal')).toBeVisible()
    })
})
