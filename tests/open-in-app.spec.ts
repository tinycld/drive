import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    dismissErrorOverlay,
    ensureListView,
    revealDriveRow,
    shareStubInstalled,
    uploadFileAsDriveItem,
} from './helpers'

// Drive — "open in app" dispatch.
//
// Opening a file with an associated app must launch that app's opener
// instead of the preview modal. The opener is contributed by a package
// OTHER than drive (calc registers it for xlsx, text for docx, …) through
// drive's DriveItemAction registry. Asserting on the real calc/text
// surfaces would couple drive's CI to those packages' internals and — more
// subtly — to their lazy provider chunks actually loading on the drive
// landing screen (they don't, until that package is visited).
//
// So these specs drive ONLY drive's own contract: a file whose mime type
// has a registered opener resolves to that opener on double-click, and
// drive invokes its onPress. The opener is supplied by @tinycld/share-stub
// (CI scaffolds it), which registers a stub DriveItemAction for
// `application/x-tinycld-stub` whose onPress beacons the drive route with
// `?openInApp=<id>`. A file with no registered opener falls back to the
// preview modal — that path needs no sibling and is asserted directly.

const STUB_MIME = 'application/x-tinycld-stub'
// The beacon param the stub opener appends — must match STUB_OPEN_PARAM in
// tests/scripts/scaffold-share-stub.ts.
const STUB_OPEN_PARAM = 'openInApp'

async function uploadStubFixture(name: string): Promise<{ id: string; name: string }> {
    const path = join(tmpdir(), `${name}.stub`)
    writeFileSync(path, 'stub-fixture-bytes')
    const { id } = await uploadFileAsDriveItem({
        fixturePath: path,
        name: `${name}.stub`,
        mimeType: STUB_MIME,
    })
    return { id, name: `${name}.stub` }
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

    test.describe('with a registered opener (stub)', () => {
        // Needs @tinycld/share-stub assembled (CI scaffolds it); skip on a
        // plain dev workspace where no opener is registered for the stub mime
        // rather than fail with a preview-fallback that looks like a bug.
        test.skip(!shareStubInstalled(), '@tinycld/share-stub not assembled in this workspace')

        test('double-clicking a file with a registered opener invokes that opener', async ({
            page,
        }) => {
            const fixture = await uploadStubFixture(`open-in-app-${Date.now()}`)
            const row = await revealDriveRow(page, fixture.name)
            await row.dblclick()
            // The stub opener's onPress fired iff the URL carries its beacon
            // param keyed to this item — proving drive resolved the action and
            // called it, not that it fell back to the preview modal.
            await page.waitForURL(new RegExp(`[?&]${STUB_OPEN_PARAM}=${fixture.id}(?:&|$)`), {
                timeout: 30_000,
            })
            await expect(page.getByTestId('file-preview-modal')).not.toBeVisible()
        })
    })

    test('double-clicking a file with no registered opener opens the preview modal', async ({
        page,
    }) => {
        const row = await revealDriveRow(page, 'Hippo.jpg')
        await row.dblclick()
        await expect(page.getByTestId('file-preview-modal')).toBeVisible()
    })

    test('right-clicking a file still offers Preview', async ({ page }) => {
        const row = await revealDriveRow(page, 'Sample Document.docx')
        await row.click({ button: 'right' })
        await page.getByText('Preview', { exact: true }).click()
        await expect(page.getByTestId('file-preview-modal')).toBeVisible()
    })
})
