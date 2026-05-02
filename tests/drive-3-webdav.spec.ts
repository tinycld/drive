import { expect, test } from '@playwright/test'
import {
    login,
    navigateToPackage,
    ORG_SLUG,
    TEST_USER_EMAIL,
    TEST_USER_PASSWORD,
} from '../../../../tests/e2e/helpers'
import {
    deleteResource,
    mkcol,
    nameFromHref,
    propfind,
    putFile,
    rawWebdavRequest,
} from './webdav-helpers'

const PB_URL = 'http://127.0.0.1:7091'

// Authenticate against PocketBase as the test user and return the auth token.
// Used to mutate drive_items through the REST API — the same path the web UI
// takes via pbtsdb — so we can assert that UI-side mutations propagate to the
// WebDAV view without depending on flaky UI interactions.
async function authAsTestUser(): Promise<string> {
    const res = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: TEST_USER_EMAIL, password: TEST_USER_PASSWORD }),
    })
    if (!res.ok) {
        throw new Error(`PB auth failed: ${res.status} ${await res.text()}`)
    }
    const { token } = (await res.json()) as { token: string }
    return token
}

// Resolve the org and user_org records for the test user. The drive_items
// schema requires both — `org` for partitioning and `created_by` for
// quota / share-permission tracking.
async function resolveOrgContext(
    token: string
): Promise<{ orgId: string; userOrgId: string }> {
    const orgs = await fetch(
        `${PB_URL}/api/collections/orgs/records?filter=${encodeURIComponent(
            `slug='${ORG_SLUG}'`
        )}`,
        { headers: { Authorization: token } }
    )
    const orgItems = (await orgs.json()) as { items: { id: string }[] }
    if (!orgItems.items[0]) throw new Error(`Org ${ORG_SLUG} not found`)
    const orgId = orgItems.items[0].id

    const userOrgs = await fetch(
        `${PB_URL}/api/collections/user_org/records?filter=${encodeURIComponent(
            `org='${orgId}'`
        )}`,
        { headers: { Authorization: token } }
    )
    const userOrgItems = (await userOrgs.json()) as { items: { id: string }[] }
    if (!userOrgItems.items[0]) throw new Error(`user_org for ${ORG_SLUG} not found`)
    return { orgId, userOrgId: userOrgItems.items[0].id }
}

test.describe('Drive — WebDAV', () => {
    test('root PROPFIND lists folders for the user’s orgs', async () => {
        const responses = await propfind('/', '1')
        const childSlugs = responses
            .filter(r => r.href !== '/drive/' && r.href !== '/drive')
            .map(r => nameFromHref(r.href))
        expect(childSlugs).toContain(ORG_SLUG)
    })

    test('org PROPFIND matches the names visible in the web UI', async ({ page }) => {
        // Snapshot folder names visible in the web UI at the org's drive root.
        await login(page)
        await navigateToPackage(page, 'drive')
        // Wait for any seeded root folder to appear before snapshotting.
        await expect(page.getByText('Projects').first()).toBeVisible({ timeout: 10_000 })

        const expectedRootNames = ['Projects', 'Personal', 'Archive']
        for (const name of expectedRootNames) {
            await expect(page.getByText(name).first()).toBeVisible()
        }

        // PROPFIND the same org root over WebDAV.
        const responses = await propfind(`/${ORG_SLUG}/`, '1')
        const hrefs = responses.map(r => r.href)
        const webdavNames = new Set(
            responses
                .filter(r => r.href !== `/drive/${ORG_SLUG}/`)
                .map(r => nameFromHref(r.href))
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
            await putFile(`/${ORG_SLUG}/${fileName}`, body, 'text/plain')

            await login(page)
            await navigateToPackage(page, 'drive')
            await expect(page.getByText(fileName).first()).toBeVisible({ timeout: 15_000 })
        } finally {
            await deleteResource(`/${ORG_SLUG}/${fileName}`)
        }
    })

    test('MKCOL via WebDAV becomes visible in the web UI', async ({ page }) => {
        const folderName = `webdav-mkcol-${Date.now()}`

        try {
            await mkcol(`/${ORG_SLUG}/${folderName}/`)

            await login(page)
            await navigateToPackage(page, 'drive')
            await expect(page.getByText(folderName).first()).toBeVisible({ timeout: 15_000 })
        } finally {
            await deleteResource(`/${ORG_SLUG}/${folderName}/`)
        }
    })

    test('UI-side create + rename via PB REST is visible in WebDAV', async () => {
        // The web UI mutates drive_items through pbtsdb, which talks to the
        // PocketBase REST API under the hood. Driving the same REST endpoints
        // here exercises the UI's write path without touching the (flaky)
        // rename modal. We then assert via PROPFIND that both the created
        // and renamed states are reflected in the WebDAV view.
        const token = await authAsTestUser()
        const { orgId, userOrgId } = await resolveOrgContext(token)

        const original = `webdav-roundtrip-src-${Date.now()}`
        const renamed = `webdav-roundtrip-dst-${Date.now()}`

        // Create folder via PB REST.
        const createRes = await fetch(`${PB_URL}/api/collections/drive_items/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({
                org: orgId,
                created_by: userOrgId,
                parent: '',
                name: original,
                is_folder: true,
                size: 0,
            }),
        })
        if (!createRes.ok) {
            throw new Error(`Create item failed: ${createRes.status} ${await createRes.text()}`)
        }
        const created = (await createRes.json()) as { id: string }

        try {
            // Assert the created folder is in the WebDAV org-root listing.
            const before = await propfind(`/${ORG_SLUG}/`, '1')
            const beforeNames = new Set(
                before
                    .filter(r => r.href !== `/drive/${ORG_SLUG}/`)
                    .map(r => nameFromHref(r.href))
            )
            expect(beforeNames.has(original), `WebDAV missing newly-created "${original}"`).toBe(
                true
            )

            // Rename via PB REST (the same path the UI's rename modal takes).
            const renameRes = await fetch(
                `${PB_URL}/api/collections/drive_items/records/${created.id}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: token },
                    body: JSON.stringify({ name: renamed }),
                }
            )
            if (!renameRes.ok) {
                throw new Error(
                    `Rename item failed: ${renameRes.status} ${await renameRes.text()}`
                )
            }

            // PROPFIND again: new name visible, old name gone.
            const after = await propfind(`/${ORG_SLUG}/`, '1')
            const afterNames = new Set(
                after
                    .filter(r => r.href !== `/drive/${ORG_SLUG}/`)
                    .map(r => nameFromHref(r.href))
            )
            expect(
                afterNames.has(renamed),
                `WebDAV missing renamed "${renamed}"`
            ).toBe(true)
            expect(
                afterNames.has(original),
                `WebDAV still has stale "${original}"`
            ).toBe(false)
        } finally {
            await fetch(`${PB_URL}/api/collections/drive_items/records/${created.id}`, {
                method: 'DELETE',
                headers: { Authorization: token },
            })
        }
    })

    test('old /webdav prefix no longer routes to WebDAV', async () => {
        // /webdav/<slug>/ used to return a 207 Multistatus PROPFIND response.
        // After the rename, the route is unbound; the request falls through
        // to the static handler and is served either 404 or 200 (SPA shell).
        // Either way it's NOT WebDAV — assert by status, since 207 would
        // mean the old route is still alive.
        const status = await rawWebdavRequest('PROPFIND', `/webdav/${ORG_SLUG}/`)
        expect(status).not.toBe(207)
    })
})
