import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
    login,
    navigateToPackage,
    signInAsCollaborator,
    TEST_COLLABORATOR_EMAIL,
    TEST_COLLABORATOR_NAME,
} from '@tinycld/core/e2e-helpers'
import { driveItem, revealDriveRow } from './helpers'

// Group sharing end to end, all through the UI: owner creates a group holding
// the collaborator, creates a folder, shares it with the group as Viewer; the
// collaborator sees it under Shared with me; the owner removes the
// collaborator from the group; after a remount the folder is gone.
// Share FIRST, sign the collaborator in AFTER: realtime does not announce a
// newly-visible item. Never page.reload(); remount via navigateToPackage.

async function openGroupsSettings(page: Page) {
    await navigateToPackage(page, 'settings')
    await page.getByText('Groups', { exact: true }).first().click()
    await expect(page.getByTestId('groups-new-button')).toBeVisible()
}

async function closeDrawer(page: Page) {
    // The drawer's backdrop otherwise blocks the sidebar nav the next step
    // clicks through.
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0)
}

async function createGroupWithCollaborator(page: Page, groupName: string) {
    await openGroupsSettings(page)
    await page.getByTestId('groups-new-button').click()
    await page.getByTestId('name').fill(groupName)
    await page.getByTestId('group-create-submit').click()
    // The drawer switches to the new group's view.
    await expect(page.getByTestId('group-add-member-search')).toBeVisible()
    await page.getByTestId('group-add-member-search').fill(TEST_COLLABORATOR_EMAIL)
    await page.getByRole('button', { name: /^Add Collaborator Tester/ }).click()
    await expect(page.getByTestId(`group-member-row-${TEST_COLLABORATOR_EMAIL}`)).toBeVisible()
    await closeDrawer(page)
}

async function removeCollaboratorFromGroup(page: Page, groupName: string) {
    await openGroupsSettings(page)
    await page.getByTestId(`group-row-${groupName}`).click()
    await page.getByRole('button', { name: /^Remove Collaborator Tester from group/ }).click()
    await expect(page.getByTestId(`group-member-row-${TEST_COLLABORATOR_EMAIL}`)).toHaveCount(0)
    await closeDrawer(page)
}

async function createFolderViaUI(page: Page, name: string) {
    await page.getByRole('button', { name: 'New folder' }).click()
    const nameInput = page.getByPlaceholder('Untitled folder')
    await expect(nameInput).toBeVisible()
    await nameInput.fill(name)
    await page.getByRole('button', { name: 'Create' }).click()
}

async function shareItemWithGroup(page: Page, name: string, groupName: string) {
    const dialog = await openShareDialog(page, name)
    await dialog.getByRole('button', { name: 'Add group' }).click()
    await page.getByTestId('group-picker-role-viewer').click()
    await page.getByTestId('group-picker-search').fill(groupName)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const section = page.getByTestId('group-share-section')
    await expect(section.getByText(groupName)).toBeVisible()
    await expect(section.getByText('1 member')).toBeVisible()
    await expect(
        section.getByRole('button', { name: `Change role for group ${groupName}` })
    ).toHaveText('Viewer')
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(dialog).toHaveCount(0)
}

async function openShareDialog(page: Page, name: string) {
    const row = await revealDriveRow(page, name)
    await row.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Share' }).click()
    const dialog = page.getByTestId('share-dialog')
    await expect(dialog).toBeVisible()
    return dialog
}

// The control item: shared with the collaborator directly, so it stays in
// their Shared with me after the group loses them. Seeing it proves the
// listing has loaded, which makes the absence check below meaningful.
async function shareItemWithCollaborator(page: Page, name: string) {
    const dialog = await openShareDialog(page, name)
    await dialog.getByPlaceholder('Add people by name or email').fill(TEST_COLLABORATOR_EMAIL)
    await dialog.getByText(TEST_COLLABORATOR_NAME, { exact: true }).click()
    await expect(dialog.getByText(TEST_COLLABORATOR_EMAIL, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(dialog).toHaveCount(0)
}

async function openSharedWithMe(page: Page) {
    await navigateToPackage(page, 'drive')
    await page
        .getByTestId('package-sidebar-mounted')
        .getByText('Shared with me', { exact: true })
        .click()
    await expect(page.getByRole('heading', { name: 'Shared with me', exact: true })).toBeVisible()
}

test.describe('Drive — sharing with a group', () => {
    test('group members see the item; leaving the group removes it', async ({ page }) => {
        await login(page)
        const stamp = Date.now()
        const groupName = `Launch crew ${stamp}`
        const folderName = `group-share-${stamp}`
        const controlName = `direct-share-${stamp}`

        await createGroupWithCollaborator(page, groupName)

        await navigateToPackage(page, 'drive')
        await createFolderViaUI(page, folderName)
        await shareItemWithGroup(page, folderName, groupName)
        await page.getByPlaceholder('Search in Files').clear()
        await createFolderViaUI(page, controlName)
        await shareItemWithCollaborator(page, controlName)

        const { page: bobPage, close } = await signInAsCollaborator(page)
        try {
            await openSharedWithMe(bobPage)
            await expect(driveItem(bobPage, controlName)).toBeVisible()
            await expect(driveItem(bobPage, folderName)).toBeVisible()

            await removeCollaboratorFromGroup(page, groupName)

            // Remount the collaborator's drive so the listing re-queries under
            // the new membership; realtime does not announce a lost grant.
            await navigateToPackage(bobPage, 'settings')
            await openSharedWithMe(bobPage)
            await expect(driveItem(bobPage, controlName)).toBeVisible()
            await expect(driveItem(bobPage, folderName)).toHaveCount(0)
        } finally {
            await close()
        }
    })
})
