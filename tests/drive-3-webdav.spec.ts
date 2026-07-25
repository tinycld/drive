import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    deleteResource,
    mkcol,
    nameFromHref,
    propfind,
    putFile,
    rawWebdavRequest,
} from './webdav-helpers'

// Single-org: the WebDAV tree hangs directly off /drive — there is no
// /drive/<orgSlug>/ segment any more (the router gives each org its own
// process instead).
const DAV_ROOT = '/'
const DAV_ROOT_HREF = '/drive/'

test.describe('Drive — WebDAV', () => {
    test('root PROPFIND matches the names visible in the web UI', async ({ page }) => {
        // Snapshot folder names visible in the web UI at the drive root.
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        // Wait for any seeded root folder to appear before snapshotting.
        await expect(page.getByText('Projects').first()).toBeVisible()

        const expectedRootNames = ['Projects', 'Personal', 'Archive']
        for (const name of expectedRootNames) {
            await expect(page.getByText(name).first()).toBeVisible()
        }

        // PROPFIND the same root over WebDAV.
        const responses = await propfind(DAV_ROOT, '1')
        const hrefs = responses.map(r => r.href)
        const webdavNames = new Set(
            responses.filter(r => r.href !== DAV_ROOT_HREF).map(r => nameFromHref(r.href))
        )

        for (const name of expectedRootNames) {
            expect(
                webdavNames.has(name),
                `WebDAV listing missing "${name}". Got hrefs: ${JSON.stringify(hrefs)}`
            ).toBe(true)
        }
    })

    test('PUT via WebDAV becomes visible in the web UI', async ({ page }) => {
        const fileName = `webdav-put-${Date.now()}.txt`
        const body = 'sync test file body'

        try {
            await putFile(`/${fileName}`, body, 'text/plain')

            await login(page)
            await navigateToPackage(page, 'drive', {
                waitFor: page.getByTestId('package-sidebar-mounted'),
            })
            // The drive root mixes seeded fixtures with files from
            // earlier suites, so the WebDAV-injected row often lands
            // below the FlashList viewport. Filter the list with the
            // search box so we get a deterministic single-row view to
            // assert against, regardless of how many neighbouring rows
            // the run accumulated. Drive rows render as accessibility
            // buttons whose name is `<filename> <Month D, YYYY>`.
            await page.getByPlaceholder('Search in Files').fill(fileName)
            await expect(
                page.getByLabel(new RegExp(`^${escapeRegex(fileName)} `)).filter({ visible: true })
            ).toBeVisible()
        } finally {
            await deleteResource(`/${fileName}`)
        }
    })

    test('MKCOL via WebDAV becomes visible in the web UI', async ({ page }) => {
        const folderName = `webdav-mkcol-${Date.now()}`

        try {
            await mkcol(`/${folderName}/`)

            await login(page)
            await navigateToPackage(page, 'drive', {
                waitFor: page.getByTestId('package-sidebar-mounted'),
            })
            // Same filter-with-search trick as the PUT test above; the
            // WebDAV-created folder otherwise tends to land outside the
            // FlashList viewport and toBeVisible() rejects it.
            await page.getByPlaceholder('Search in Files').fill(folderName)
            await expect(
                page
                    .getByLabel(new RegExp(`^${escapeRegex(folderName)} `))
                    .filter({ visible: true })
            ).toBeVisible()
        } finally {
            await deleteResource(`/${folderName}/`)
        }
    })

    test('UI-side create + rename is visible in WebDAV', async ({ page }) => {
        // Drive the real UI (New folder dialog, then the rename prompt) so the
        // write goes through useMutation/pbtsdb exactly as a user's would, then
        // assert via PROPFIND that both states reach the WebDAV view.
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const original = `webdav-roundtrip-src-${stamp}`
        const renamed = `webdav-roundtrip-dst-${stamp}`

        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })

        await page.getByRole('button', { name: 'New folder' }).click()
        const nameInput = page.getByPlaceholder('Untitled folder')
        await expect(nameInput).toBeVisible()
        await nameInput.fill(original)
        await page.getByRole('button', { name: 'Create' }).click()

        // Surface the new row: at the seeded root it can sort off-screen and be
        // virtualized out of the listing even though it's in the data.
        const search = page.getByPlaceholder('Search in Files')
        await search.fill(original)
        const row = page.getByLabel(new RegExp(`^${escapeRegex(original)} `)).filter({
            visible: true,
        })
        await expect(row).toBeVisible()

        try {
            // Assert the created folder is in the WebDAV root listing.
            const before = await propfind(DAV_ROOT, '1')
            const beforeNames = new Set(
                before.filter(r => r.href !== DAV_ROOT_HREF).map(r => nameFromHref(r.href))
            )
            expect(beforeNames.has(original), `WebDAV missing newly-created "${original}"`).toBe(
                true
            )

            // Rename through the toolbar prompt.
            await row.click()
            await page.getByLabel('Rename', { exact: true }).click()
            const renameInput = page.getByTestId('drive-name-prompt-input')
            await expect(renameInput).toBeVisible()
            await renameInput.clear()
            await renameInput.fill(renamed)
            await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click()

            await search.fill(renamed)
            await expect(
                page.getByLabel(new RegExp(`^${escapeRegex(renamed)} `)).filter({ visible: true })
            ).toBeVisible()

            // PROPFIND again: new name visible, old name gone.
            const after = await propfind(DAV_ROOT, '1')
            const afterNames = new Set(
                after.filter(r => r.href !== DAV_ROOT_HREF).map(r => nameFromHref(r.href))
            )
            expect(afterNames.has(renamed), `WebDAV missing renamed "${renamed}"`).toBe(true)
            expect(afterNames.has(original), `WebDAV still has stale "${original}"`).toBe(false)
        } finally {
            await deleteResource(`/${renamed}/`)
        }
    })

    test('old /webdav prefix no longer routes to WebDAV', async () => {
        // /webdav/ used to return a 207 Multistatus PROPFIND response. After
        // the rename, the route is unbound; the request falls through to the
        // static handler and is served either 404 or 200 (SPA shell). Either
        // way it's NOT WebDAV — assert by status, since 207 would mean the old
        // route is still alive.
        const status = await rawWebdavRequest('PROPFIND', '/webdav/')
        expect(status).not.toBe(207)
    })
})

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
