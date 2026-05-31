import { expect, test } from '@playwright/test'
import { clickSidebarItem, login, navigateToPackage, ORG_SLUG } from '../../app/tests/e2e/helpers'
import { dismissErrorOverlay } from './helpers'

// The toolbar's primary heading mirrors whichever drive section the
// user is viewing. At a folder it shows the folder name; at a section
// root it shows the section label (matching the sidebar item).
//
// Drive's layout uses FrozenSlideStack: previously-visited screens stay
// mounted-but-frozen, so a sidebar click from /drive → /drive/trash
// leaves both screens' headings in the accessibility tree. To assert on
// a single heading reliably, each test loads its section via page.goto
// (a fresh navigation that drops the prior frozen screen) rather than
// chaining through the sidebar.
test.describe('Drive — section heading', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
    })

    test('My Files at /drive root', async ({ page }) => {
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)
        await expect(page.getByRole('heading', { name: 'My Files', level: 1 })).toBeVisible({
            timeout: 15_000,
        })
    })

    test('Recent at /drive/recent', async ({ page }) => {
        await page.goto(`/a/${ORG_SLUG}/drive/recent`)
        await dismissErrorOverlay(page)
        await expect(page.getByRole('heading', { name: 'Recent', level: 1 })).toBeVisible({
            timeout: 15_000,
        })
    })

    test('Starred at /drive/starred', async ({ page }) => {
        await page.goto(`/a/${ORG_SLUG}/drive/starred`)
        await dismissErrorOverlay(page)
        await expect(page.getByRole('heading', { name: 'Starred', level: 1 })).toBeVisible({
            timeout: 15_000,
        })
    })

    test('Shared with me at /drive/shared', async ({ page }) => {
        await page.goto(`/a/${ORG_SLUG}/drive/shared`)
        await dismissErrorOverlay(page)
        await expect(page.getByRole('heading', { name: 'Shared with me', level: 1 })).toBeVisible({
            timeout: 15_000,
        })
    })

    test('Trash at /drive/trash', async ({ page }) => {
        await page.goto(`/a/${ORG_SLUG}/drive/trash`)
        await dismissErrorOverlay(page)
        await expect(page.getByRole('heading', { name: 'Trash', level: 1 })).toBeVisible({
            timeout: 15_000,
        })
    })

    test('sidebar nav from My Files to Recent updates the heading', async ({ page }) => {
        // In-app navigation (no fresh page load) — exercises the
        // currentLabel reactivity, not just the initial render. After
        // navigating away from My Files the FrozenSlideStack keeps the
        // prior screen mounted; the active screen's heading is the one
        // currently rendered as visible.
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)
        await expect(page.getByRole('heading', { name: 'My Files', level: 1 })).toBeVisible({
            timeout: 15_000,
        })
        await clickSidebarItem(page, 'Recent')
        await expect(page.getByRole('heading', { name: 'Recent', level: 1 }).first()).toBeVisible({
            timeout: 10_000,
        })
    })
})
