import { expect, type Page, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import { driveItem, revealDriveRow } from './helpers'

// Proves drive:move-to-folder closes the loop: a rule built in the real
// builder files a newly created item into another folder, and the visible
// effect is the item being IN the destination and gone from where it landed.
//
// Everything is driven through the UI — the New folder dialog for setup, the
// builder for the rule — rather than the REST helper in ./helpers, per the
// workspace rule that e2e sets up data by driving the UI.
async function navigateToRulesSettings(page: Page) {
    await page.getByTestId('nav-settings').click()
    await page.getByText('Rules', { exact: true }).first().click()
    await expect(page.getByText('My rules', { exact: true })).toBeVisible()
}

// Picks a trigger or action by its qualified ref. Labels are not unique
// across packages — drive and mail both contribute "Move to folder" — so
// selecting by text alone silently configures whichever the DOM happened to
// order first. The ref is unique by construction.
async function selectByRef(
    page: Page,
    trigger: import('@playwright/test').Locator,
    kind: 'trigger' | 'action',
    ref: string
) {
    await trigger.click()
    await page.getByTestId(`${kind}-option-${ref}`).click()
}

async function createFolderViaDialog(page: Page, name: string) {
    await page.getByRole('button', { name: 'New folder' }).click()
    const nameInput = page.getByPlaceholder('Untitled folder')
    await expect(nameInput).toBeVisible()
    await nameInput.fill(name)
    await page.getByRole('button', { name: 'Create' }).click()
    // Gate on the row existing before moving on: the dialog closing is not by
    // itself proof the record landed.
    await expect(await revealDriveRow(page, name)).toBeVisible()
}

test.describe('Drive — Rules', () => {
    test('a rule files a new folder into a destination folder', async ({ page }) => {
        await login(page)

        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const destinationName = `RuleTarget-${stamp}`
        // The rule keys on this marker so it only touches items this test
        // creates — other specs share the drive.
        const filedName = `RuleFiled-${stamp}`

        // Destination first: the rule's parameter needs a folder to point at.
        await navigateToPackage(page, 'drive')
        await createFolderViaDialog(page, destinationName)

        await navigateToRulesSettings(page)
        const ruleName = `E2E drive filing ${stamp}`

        await page.getByText('New rule', { exact: true }).first().click()
        await expect(page.getByText('New rule', { exact: true }).last()).toBeVisible()
        await page.getByPlaceholder('Rule name').fill(ruleName)

        await selectByRef(
            page,
            page.getByText('Select a trigger…', { exact: true }),
            'trigger',
            'drive:file-added'
        )

        await page.getByText('add OR group', { exact: true }).click()
        await page.getByText('add condition', { exact: true }).click()
        // By column key, not label: "Name" is also drive's file-list column
        // header and the destination folder's own text, so matching on the
        // word alone lands somewhere other than the menu.
        await page.getByText('Field…', { exact: true }).click()
        await page.getByTestId('condition-field-option-name').click()
        await page.getByRole('textbox').last().fill(filedName)

        // Mail contributes an action with this exact label too, so pick by ref
        // and then assert the row that was added really is drive's — a
        // mis-picked action would otherwise fail much later, looking unrelated.
        await selectByRef(
            page,
            page.getByText('add action', { exact: true }),
            'action',
            'drive:move-to-folder'
        )
        await expect(page.getByText('(drive)', { exact: true })).toBeVisible()

        // The destination is a real record picker: move-to-folder's param
        // names the `parent` column, so the catalog resolves its relation
        // target to drive_items and lists folders by name.
        //
        // Search rather than scroll — the menu caps how many matches it
        // renders, and a seeded drive has far more items than that, so a
        // freshly created folder is only reachable by narrowing.
        await page.getByText('Select…', { exact: true }).last().click()
        await page.getByPlaceholder('Search…').fill(destinationName)
        await page.getByText(destinationName, { exact: true }).last().click({ force: true })

        await page.getByText('Save', { exact: true }).click()
        await expect(page.getByText(ruleName, { exact: true })).toBeVisible()

        // Real ingress: create the item through the same dialog a user would.
        // It lands at the root — the rule is what should move it.
        await navigateToPackage(page, 'drive')
        await createFolderViaDialog(page, filedName)

        // The visible effect: the item is now INSIDE the destination.
        //
        // Asserted by opening the destination from the sidebar tree rather
        // than the list: createFolderViaDialog leaves the file pane showing
        // search results, and the sidebar is the one surface that reflects the
        // real parent/child nesting regardless of what the pane is filtered to.
        await page.getByText(destinationName, { exact: true }).first().click()
        await expect(driveItem(page, filedName)).toBeVisible({ timeout: 20_000 })
    })

    test('the drive rules help topic is searchable and renders', async ({ page }) => {
        await login(page)

        await page.getByTestId('nav-help').click()
        await expect(page).toHaveURL(/\/help$/)

        await page.getByPlaceholder('Search help topics').fill('drive rules')
        await page.getByText('Drive rules', { exact: true }).click()

        await expect(page).toHaveURL(/\/help\/drive\/rules$/)
        await expect(page.getByText('When a file is added', { exact: true })).toBeVisible()
    })
})
