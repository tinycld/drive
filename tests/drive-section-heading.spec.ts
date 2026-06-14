import { expect, test } from '@playwright/test'
import { clickSidebarItem, login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { dismissErrorOverlay } from './helpers'

// The toolbar's primary heading mirrors whichever drive section the
// user is viewing. At a folder it shows the folder name; at a section
// root it shows the section label (matching the sidebar item).
//
// Drive's layout uses FrozenSlideStack: previously-visited screens stay
// mounted-but-frozen, so a sidebar click from /drive → /drive/trash
// leaves both screens' headings in the accessibility tree. The frozen
// screen's heading stays in the tree but is NOT visible, so each
// assertion uses `.first()` + toBeVisible — the visible-filter drops the
// stale frozen heading. We reach each section by clicking its sidebar
// item (SPA nav) rather than page.goto: a hard navigation tears down the
// SPA and cancels in-flight chunk loads, forcing a Metro recompile that
// compounds CI flakiness.
test.describe('Drive — section heading', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)
    })

    test('My Files at /drive root', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'My Files', level: 1 }).first()).toBeVisible(
            { timeout: 15_000 }
        )
    })

    test('Recent at /drive/recent', async ({ page }) => {
        await clickSidebarItem(page, 'Recent')
        await expect(page.getByRole('heading', { name: 'Recent', level: 1 }).first()).toBeVisible({
            timeout: 15_000,
        })
    })

    test('Starred at /drive/starred', async ({ page }) => {
        await clickSidebarItem(page, 'Starred')
        await expect(page.getByRole('heading', { name: 'Starred', level: 1 }).first()).toBeVisible({
            timeout: 15_000,
        })
    })

    test('Shared with me at /drive/shared', async ({ page }) => {
        await clickSidebarItem(page, 'Shared with me')
        await expect(
            page.getByRole('heading', { name: 'Shared with me', level: 1 }).first()
        ).toBeVisible({ timeout: 15_000 })
    })

    test('Trash at /drive/trash', async ({ page }) => {
        await clickSidebarItem(page, 'Trash')
        await expect(page.getByRole('heading', { name: 'Trash', level: 1 }).first()).toBeVisible({
            timeout: 15_000,
        })
    })

    test('sidebar nav from My Files to Recent updates the heading', async ({ page }) => {
        // Exercises currentLabel reactivity across an in-app nav (not just
        // the initial render): assert My Files first, then click through to
        // Recent. The FrozenSlideStack keeps My Files mounted but the
        // visible heading is the active screen's.
        await expect(page.getByRole('heading', { name: 'My Files', level: 1 }).first()).toBeVisible(
            { timeout: 15_000 }
        )
        await clickSidebarItem(page, 'Recent')
        await expect(page.getByRole('heading', { name: 'Recent', level: 1 }).first()).toBeVisible({
            timeout: 10_000,
        })
    })
})
