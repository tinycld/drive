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

    test('navigate into folder', async ({ page }) => {
        await page.getByText('Projects').first().dblclick()

        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText('Marketing').first()).toBeVisible()
        await expect(page.getByText('Engineering').first()).toBeVisible()
    })

    test('breadcrumb navigation', async ({ page }) => {
        // Navigate into Projects > Engineering
        await page.getByText('Projects').first().dblclick()
        await expect(page.getByText('Q1 Planning').first()).toBeVisible({ timeout: 10_000 })

        await page.getByText('Engineering').first().dblclick()
        await expect(page.getByText('API Documentation').first()).toBeVisible({ timeout: 10_000 })

        // The "My Files" link appears in the breadcrumb bar — click the first one
        const myFiles = page.getByText('My Files')
        await myFiles.first().click()
        await expect(page.getByText('Projects').first()).toBeVisible({ timeout: 10_000 })
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
