import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { dismissErrorOverlay, driveItem, openDriveItem } from './helpers'

// TINYCLD-26: going into Drive threw "t.split is not a function" from the
// router's useLinking. The drive route [...path] names its param `path`, and
// React Navigation also reads params.path as a screen's URL path, so the
// array can reach getStateFromPath. This walks nested folders and back, at
// both layouts, and fails on any page error that names split.
function collectSplitErrors(page: Page): string[] {
    const errors: string[] = []
    page.on('pageerror', err => {
        if (err.message.includes('split is not a function')) errors.push(err.message)
    })
    return errors
}

// Root → Projects → Engineering, back to the root by the breadcrumb (shown
// from two levels deep), then back through the history to Projects.
async function walkNestedFolders(page: Page) {
    await openDriveItem(page, 'Projects')
    await expect(driveItem(page, 'Engineering')).toBeVisible()
    await openDriveItem(page, 'Engineering')
    await page.getByRole('button', { name: 'Breadcrumb: My Files', exact: true }).click()
    await expect(driveItem(page, 'Projects')).toBeVisible()
    await page.goBack()
    await page.goBack()
    await expect(driveItem(page, 'Engineering')).toBeVisible()
}

test.describe('Drive — path param', () => {
    test('nested folders do not break the router (desktop)', async ({ page }) => {
        const errors = collectSplitErrors(page)
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)

        await walkNestedFolders(page)

        expect(errors).toEqual([])
    })

    test('nested folders do not break the router (phone)', async ({ page }) => {
        const errors = collectSplitErrors(page)
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)
        await page.setViewportSize({ width: 390, height: 844 })

        await openDriveItem(page, 'Projects')
        await expect(driveItem(page, 'Engineering')).toBeVisible()
        await openDriveItem(page, 'Engineering')
        await page.goBack()
        await expect(driveItem(page, 'Engineering')).toBeVisible()

        expect(errors).toEqual([])
    })
})
