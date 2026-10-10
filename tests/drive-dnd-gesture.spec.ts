import { expect, type Locator, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    dismissErrorOverlay,
    dragItemOnto,
    driveItem,
    ensureListView,
    openDriveItem,
    revealDriveRow,
} from './helpers'

// How the drag gesture itself behaves on a fast mouse and a long listing. Setup
// goes through the UI, and the one seeded file a test moves goes back to the
// root before it ends.

const preview = (page: Page) => page.getByTestId('drive-drag-preview')

// Press on the source at `offset` inside it, then hold the mouse down and move
// it by `firstMove` in ONE pointermove — what a fast mouse does. Under load the
// first press can be lost before the gesture exists, and other specs reshape
// the shared listing, so each attempt finds the source again; a press that does
// not produce the preview is released over its source and repeated, as a user
// would.
async function startDrag(
    page: Page,
    locateSource: () => Promise<Locator>,
    offset: { x: number; y: number },
    firstMove: { x: number; y: number }
): Promise<{ x: number; y: number }> {
    let press: { x: number; y: number } | null = null
    await expect(async () => {
        if ((await preview(page).count()) === 0) {
            if (press) {
                // A drag that did start drops on nothing that accepts it here.
                await page.mouse.move(press.x, press.y)
                await page.mouse.up()
            }
            const box = await (await locateSource()).boundingBox()
            const viewport = page.viewportSize()
            if (!box || !viewport) throw new Error('startDrag: source is not visible')
            press = { x: box.x + offset.x, y: box.y + offset.y }
            // A press outside the window never reaches the page, and neither
            // would its release, which leaves the gesture stuck.
            if (
                press.x < 0 ||
                press.y < 0 ||
                press.x > viewport.width ||
                press.y > viewport.height
            ) {
                press = null
                throw new Error('startDrag: source is outside the window')
            }
            await page.mouse.move(press.x, press.y)
            await page.mouse.down()
            await page.waitForTimeout(60)
            await page.mouse.move(press.x + firstMove.x, press.y + firstMove.y)
            // gesture-handler's web pan ignores a move that leaves the pressed
            // view, so a jump off a small grip needs one more move to activate.
            // A real mouse sends many.
            await page.mouse.move(press.x + firstMove.x + 1, press.y + firstMove.y)
        }
        await expect(preview(page)).toHaveCount(1, { timeout: 2_000 })
    }).toPass()
    if (!press) throw new Error('startDrag: no press')
    return press
}

async function createFolderViaDialog(page: Page, name: string) {
    await page.getByRole('button', { name: 'New folder' }).click()
    const nameInput = page.getByPlaceholder('Untitled folder')
    await expect(nameInput).toBeVisible()
    await nameInput.fill(name)
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(await revealDriveRow(page, name)).toBeVisible()
}

// The drive list's own scroll element: the nearest scrollable ancestor of a
// visible row. Look it up again for every use: the list element is replaced
// whenever the listing remounts (search, navigation, a sort change another
// spec makes to the shared preference).
async function listScroller(page: Page) {
    const row = page.locator('[data-drive-item-id]').filter({ visible: true }).first()
    return row.evaluateHandle(el => {
        let node: HTMLElement | null = el as HTMLElement
        while (node && getComputedStyle(node).overflowY !== 'auto') node = node.parentElement
        if (!node) throw new Error('drive list has no scroll element')
        return node
    })
}

test.describe('Drive — drag gesture', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)
    })

    // A fast mouse covers the drag's activation distance in one pointermove.
    // The preview must still keep the spot the user pressed under the pointer,
    // not the spot where the drag activated, or it trails the pointer for the
    // whole drag.
    test('the drag preview keeps the pressed spot under a fast pointer', async ({ page }) => {
        await page.getByTestId('drive-view-grid').click()
        // The top-left card: a folder, since folders sort first. Other specs
        // add folders to the root, so which one varies. FlashList recycles
        // cells, so DOM order is not screen order.
        await expect(page.locator('[data-drive-item-id]').first()).toBeVisible()
        const cardTestId = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-drive-item-id]'))
                .map(el => ({ testId: el.dataset.testid ?? '', rect: el.getBoundingClientRect() }))
                .filter(card => card.rect.width > 0 && card.rect.top >= 0)
            cards.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
            return cards[0]?.testId ?? ''
        })
        const card = page.getByTestId(cardTestId)
        await expect(card).toBeVisible()

        const offset = { x: 30, y: 24 }
        const press = await startDrag(page, async () => card, offset, { x: 90, y: 70 })
        const pointer = { x: press.x + 120, y: press.y + 90 }
        await page.mouse.move(pointer.x, pointer.y)

        await expect(async () => {
            const box = await preview(page).boundingBox()
            expect(box).not.toBeNull()
            expect(Math.abs(pointer.x - (box?.x ?? 0) - offset.x)).toBeLessThanOrEqual(2)
            expect(Math.abs(pointer.y - (box?.y ?? 0) - offset.y)).toBeLessThanOrEqual(2)
        }).toPass()

        // Back over the card it came from: a folder never accepts itself.
        await page.mouse.move(press.x, press.y)
        await page.mouse.up()
        await expect(preview(page)).toHaveCount(0)
        await expect(card).toBeVisible()
    })

    // Folders sort above files, so moving a file from the bottom of a long
    // listing into a folder means carrying it up past the top of the view: the
    // list must scroll while the drag holds near its edge, the folder that
    // scrolls in must take the drop where it now is, and the drop must still
    // move the file after its own row has scrolled out of the list's window.
    test('a drag held at the top edge scrolls up to a folder and drops into it', async ({
        page,
    }) => {
        await ensureListView(page)
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const folderName = `DnD-Scroll-${stamp}`
        await createFolderViaDialog(page, folderName)
        await page.getByPlaceholder('Search in Files').clear()
        // The full root listing is back, not the search result alone.
        const rows = page.locator('[data-drive-item-id]').filter({ visible: true })
        await expect.poll(() => rows.count()).toBeGreaterThan(1)

        const folderRow = driveItem(page, folderName)
        const listBox = await (await listScroller(page)).evaluate(el => {
            const r = el.getBoundingClientRect()
            return { top: r.top, bottom: r.bottom }
        })

        // Whether the folder row is inside the list's viewport. A row scrolled
        // out of it still counts as visible to Playwright, and FlashList may
        // keep it rendered, or recycle its cell for another item.
        const folderOnScreen = async () => {
            if ((await folderRow.count()) === 0) return false
            const box = await folderRow.boundingBox()
            return !!box && box.y >= listBox.top && box.y + box.height <= listBox.bottom
        }

        // Grab the lowest file on screen with the list scrolled to the bottom:
        // a seeded root file, since folders sort first. FlashList recycles
        // cells, so DOM order is not screen order.
        let fileName = ''
        const lowestFileGrip = async () => {
            const scroller = await listScroller(page)
            // Set scrollTop: react-native-web replaces the element's scrollTo
            // with React Native's ({ x, y }) signature.
            await scroller.evaluate(el => {
                el.scrollTop = el.scrollHeight
            })
            await expect.poll(folderOnScreen).toBe(false)
            fileName = await scroller.evaluate(el => {
                const { top, bottom } = el.getBoundingClientRect()
                const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-drive-item-id]'))
                    .map(row => ({
                        testId: row.dataset.testid ?? '',
                        rect: row.getBoundingClientRect(),
                    }))
                    .filter(
                        row =>
                            row.rect.height > 0 && row.rect.top >= top && row.rect.bottom <= bottom
                    )
                rows.sort((a, b) => b.rect.bottom - a.rect.bottom)
                return rows[0]?.testId.replace(/^drive-item-/, '') ?? ''
            })
            if (!fileName) throw new Error('no row is on screen')
            return driveItem(page, fileName).getByLabel('Drag to move', { exact: true })
        }
        const press = await startDrag(page, lowestFileGrip, { x: 8, y: 8 }, { x: 0, y: -40 })

        // Hold near the top edge until the folder scrolls into view. Other
        // specs add folders to the root, so it can be anywhere among them.
        // Poll often: the list scrolls a viewport in well under a second.
        const edge = { x: press.x, y: listBox.top + 12 }
        await expect(async () => {
            for (let i = 0; i < 100 && !(await folderOnScreen()); i++) {
                await page.mouse.move(edge.x, edge.y + (i % 2))
                await page.waitForTimeout(30)
            }
            expect(await folderOnScreen()).toBe(true)
        }).toPass()

        // The folder that scrolled in takes the drag where it now is on screen.
        // Hovering near the top edge keeps scrolling, so read its position
        // again on every attempt.
        const receiving = page.getByTestId('drop-target-receiving')
        await expect(async () => {
            const folderBox = await folderRow.boundingBox()
            if (!folderBox) throw new Error('folder row is not rendered')
            const overFolder = { x: edge.x, y: folderBox.y + folderBox.height / 2 }
            await page.mouse.move(overFolder.x, overFolder.y + 6)
            await page.mouse.move(overFolder.x, overFolder.y)
            await expect(
                receiving.locator('xpath=..').getByTestId(`drive-item-${folderName}`)
            ).toHaveCount(1)
        }).toPass()
        await page.mouse.up()
        await expect(preview(page)).toHaveCount(0)

        // The file is in the folder now.
        await openDriveItem(page, folderName)
        const movedRow = driveItem(page, fileName)
        await expect(movedRow).toBeVisible()

        // Put the seeded file back at the root for the specs that share it.
        const myFiles = page
            .getByText('My Files', { exact: true })
            .filter({ visible: true })
            .first()
        await dragItemOnto(page, movedRow.getByLabel('Drag to move', { exact: true }), myFiles)
        await expect(driveItem(page, fileName)).toHaveCount(0)
    })
})
