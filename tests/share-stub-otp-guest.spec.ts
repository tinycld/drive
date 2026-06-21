import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { readLatestOtpEmail } from './email-log-helper'
import {
    authTokenForTestUser,
    shareStubInstalled,
    testUserOrgContext,
    uploadFileAsDriveItem,
} from './helpers'

// Drive — OTP guest onboarding flow against the stub package.
//
// What this replaces:
//   share-link-otp-views45.spec.ts (deleted). The original scenarios
//   asserted on text-package surfaces (Comments drawer button) and
//   calc-package surfaces (cell edit persistence) that aren't owned by
//   drive. Drive's contract for the OTP flow is:
//     1. The share route mounts the share-editor with the right mount
//        object BEFORE sign-in (anon, role-determined-by-link).
//     2. After successful OTP verify, the route REMOUNTS with a guest
//        mount whose identity.kind='member' (real PB user_org) and
//        capabilities derived from the link's role.
//     3. Re-using a verified email on a NEW link doesn't double-
//        provision users/user_org rows (idempotency).
//   Drawer access, edit-persistence, cell-input behavior — all owned
//   by the package that ships the real editor; they belong in that
//   package's e2e suite.
//
// Drive-owned UI this DOES test:
//   - ShareEditorView's "Sign in to comment/edit on this document" banner.
//     That's rendered by drive's public-screens/share/[token].tsx, so
//     asserting that it appears (anon) and disappears (post-verify) is
//     in scope for drive's E2E.

const PB_URL = 'http://127.0.0.1:7200'
const STUB_MIME = 'application/x-tinycld-stub'

function uniqueSuffix(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function uniqueGuestEmail(role: 'commentor' | 'editor'): string {
    return `guest-${role}-${uniqueSuffix()}@e2e.test`
}

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

async function createShareLink(
    itemId: string,
    role: 'viewer' | 'commentor' | 'editor'
): Promise<{ id: string; token: string }> {
    const token = await authTokenForTestUser()
    const res = await fetch(`${PB_URL}/api/drive/share-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ item_id: itemId, role }),
    })
    if (!res.ok) {
        throw new Error(`Create share link failed: ${res.status} ${await res.text()}`)
    }
    const body = (await res.json()) as { id: string; token: string }
    return { id: body.id, token: body.token }
}

// Waits until pb.authStore has flushed the post-verify auth token to
// localStorage. pb.authStore.save() is fire-and-forget against
// AsyncStorage.setItem, so without this, a reload() that races the write
// would boot the next page as anon.
async function waitForAuthStoreFlush(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const v = window.localStorage.getItem('pb_auth')
        return typeof v === 'string' && v.length > 0
    })
}

// Drives the email → code → verify path. Returns the captured OTP so a
// caller can assert further on subject/body when needed.
async function signInAsGuest(
    page: Page,
    email: string
): Promise<{ code: string; subject: string }> {
    // The Pressable in ShareEditorView wraps a Text "Sign in" but has no
    // explicit accessibilityRole, so it appears as a Text element on
    // RN-web. exact:true anchors on the Text — the banner copy "Sign in
    // to comment on this document" wouldn't exact-match.
    const signInTrigger = page.getByText('Sign in', { exact: true })
    await expect(signInTrigger).toBeVisible()
    await signInTrigger.click()

    // Email panel. The TextInput in ShareLinkSignIn uses
    // placeholder='your@email' — RN-web exposes placeholder as the
    // implicit accessible name when no aria-label is set.
    const emailInput = page.getByPlaceholder('your@email')
    await expect(emailInput).toBeVisible()
    await emailInput.fill(email)
    await page.getByText('Send code', { exact: true }).click()

    // Code panel.
    const codeInput = page.getByPlaceholder('123456')
    await expect(codeInput).toBeVisible()

    // Pluck the OTP from TINYCLD_EMAIL_LOG. The mailer write happens
    // synchronously inside the /otp-request handler, so 15s is generous.
    const otp = await readLatestOtpEmail(email, { timeoutMs: 15_000 })

    await codeInput.fill(otp.code)
    await page.getByText('Verify', { exact: true }).click()

    await waitForAuthStoreFlush(page)
    return { code: otp.code, subject: otp.subject }
}

async function readStubRole(page: Page): Promise<string> {
    const text = await page.locator('[data-test-id="stub-role"]').first().innerText()
    return text.replace(/^role:\s*/, '').trim()
}

async function readStubIdentityKind(page: Page): Promise<string> {
    const text = await page.locator('[data-test-id="stub-identity-kind"]').first().innerText()
    return text.replace(/^identity\.kind:\s*/, '').trim()
}

async function readStubCanComment(page: Page): Promise<boolean> {
    const text = await page.locator('[data-test-id="stub-cap-canComment"]').first().innerText()
    return text.replace(/^canComment:\s*/, '').trim() === 'true'
}

async function readStubCanEdit(page: Page): Promise<boolean> {
    const text = await page.locator('[data-test-id="stub-cap-canEdit"]').first().innerText()
    return text.replace(/^canEdit:\s*/, '').trim() === 'true'
}

// PB queries used by the idempotency scenario. The seeded test user has
// org membership; helpers.ts caches its token.
async function findUsersByEmail(email: string): Promise<{ id: string; email: string }[]> {
    const token = await authTokenForTestUser()
    const filter = `email='${email}'`
    const res = await fetch(
        `${PB_URL}/api/collections/users/records?filter=${encodeURIComponent(filter)}&perPage=200`,
        { headers: { Authorization: token } }
    )
    if (!res.ok) {
        throw new Error(`users lookup failed: ${res.status} ${await res.text()}`)
    }
    const body = (await res.json()) as { items: { id: string; email: string }[] }
    return body.items
}

async function countUserOrgs(userId: string, orgId: string): Promise<number> {
    const token = await authTokenForTestUser()
    const filter = `user='${userId}' && org='${orgId}'`
    const res = await fetch(
        `${PB_URL}/api/collections/user_org/records?filter=${encodeURIComponent(filter)}&perPage=200`,
        { headers: { Authorization: token } }
    )
    if (!res.ok) {
        throw new Error(`user_org lookup failed: ${res.status} ${await res.text()}`)
    }
    const body = (await res.json()) as { items: unknown[] }
    return body.items.length
}

test.describe('Drive — OTP guest onboarding (stub)', () => {
    test.describe.configure({ mode: 'serial' })
    // Needs the @tinycld/share-stub package assembled (CI scaffolds it); skip on
    // a plain dev workspace where it isn't present.
    test.skip(!shareStubInstalled(), '@tinycld/share-stub not assembled in this workspace')

    test('commentor: OTP sign-in flips mount to guest commentor (canComment, !canEdit)', async ({
        browser,
    }) => {
        const doc = await uploadStubFixture(`stub-otp-commentor-${uniqueSuffix()}`)
        const link = await createShareLink(doc.id, 'commentor')
        const email = uniqueGuestEmail('commentor')

        const context = await browser.newContext()
        try {
            const page = await context.newPage()
            await page.goto(`/p/drive/share/${link.token}`)
            await expect(page.getByText('Stub share editor')).toBeVisible()

            // Pre-OTP: anon commentor sees the sign-in CTA banner
            // (owned by drive's ShareEditorView). Mount is anon at this
            // point — capabilities all false.
            await expect(
                page.getByText('Sign in to comment on this document', { exact: true })
            ).toBeVisible()
            expect(await readStubIdentityKind(page)).toBe('anon')
            expect(await readStubCanComment(page)).toBe(false)

            // OTP flow.
            const otp = await signInAsGuest(page, email)
            expect(otp.subject).toMatch(/^Your code to comment on /)

            // Post-OTP: route remounts with a guest mount. The stub
            // re-renders with the new mount fields. The sign-in CTA
            // banner is gone (showSignInBanner gates on isAnon).
            await expect(
                page.getByText('Sign in to comment on this document', { exact: true })
            ).not.toBeVisible()

            // Mount must now be a guest commentor:
            //   identity.kind == 'guest' (OTP-provisioned guest user_org)
            //   role          == 'commentor'  (from the link)
            //   canComment    == true
            //   canEdit       == false (commentor can't edit the doc)
            await expect.poll(async () => readStubIdentityKind(page)).toBe('guest')
            expect(await readStubRole(page)).toBe('commentor')
            expect(await readStubCanComment(page)).toBe(true)
            expect(await readStubCanEdit(page)).toBe(false)

            // Persistence: reload the same context, the guest session
            // survives (pb.authStore token in localStorage), mount comes
            // back as guest commentor without re-prompting for OTP.
            await page.reload()
            await expect(page.getByText('Stub share editor')).toBeVisible()
            await expect(
                page.getByText('Sign in to comment on this document', { exact: true })
            ).not.toBeVisible()
            expect(await readStubIdentityKind(page)).toBe('guest')
            expect(await readStubRole(page)).toBe('commentor')
        } finally {
            await context.close()
        }
    })

    test('editor: OTP sign-in flips mount to guest editor (canEdit + canComment)', async ({
        browser,
    }) => {
        const doc = await uploadStubFixture(`stub-otp-editor-${uniqueSuffix()}`)
        const link = await createShareLink(doc.id, 'editor')
        const email = uniqueGuestEmail('editor')

        const context = await browser.newContext()
        try {
            const page = await context.newPage()
            await page.goto(`/p/drive/share/${link.token}`)
            await expect(page.getByText('Stub share editor')).toBeVisible()

            // Pre-OTP: anon editor sees the editor-specific sign-in CTA.
            // Banner copy differs from commentor ("comment on" → "edit").
            await expect(
                page.getByText('Sign in to edit this document', { exact: true })
            ).toBeVisible()

            const otp = await signInAsGuest(page, email)
            // The OTP email subject is role-agnostic ("Your code to
            // comment on …" for both commentor + editor links) — see
            // sendShareOTPEmail in drive/server/endpoints_share_otp.go.
            // We just sanity-check that we got the expected envelope.
            expect(otp.subject).toMatch(/^Your code/)

            await expect(
                page.getByText('Sign in to edit this document', { exact: true })
            ).not.toBeVisible()

            // Mount: guest editor — canEdit AND canComment true.
            await expect.poll(async () => readStubIdentityKind(page)).toBe('guest')
            expect(await readStubRole(page)).toBe('editor')
            expect(await readStubCanEdit(page)).toBe(true)
            expect(await readStubCanComment(page)).toBe(true)
        } finally {
            await context.close()
        }
    })

    test('idempotency: re-using a verified email on a new link does not double-provision', async ({
        browser,
    }) => {
        const sharedEmail = uniqueGuestEmail('commentor')
        const orgCtx = await testUserOrgContext()

        // First visit: sign in via OTP on link #1.
        const firstDoc = await uploadStubFixture(`stub-otp-idem-1-${uniqueSuffix()}`)
        const firstLink = await createShareLink(firstDoc.id, 'commentor')

        const firstContext = await browser.newContext()
        try {
            const firstPage = await firstContext.newPage()
            await firstPage.goto(`/p/drive/share/${firstLink.token}`)
            await expect(firstPage.getByText('Stub share editor')).toBeVisible()
            await signInAsGuest(firstPage, sharedEmail)
            // CTA gone means auth state really persisted; without this
            // assert, the second visit's OTP request could race the
            // first's user_org commit.
            await expect(
                firstPage.getByText('Sign in to comment on this document', { exact: true })
            ).not.toBeVisible()
        } finally {
            await firstContext.close()
        }

        // Snapshot: exactly 1 user, 1 user_org for the new email.
        const usersAfterFirst = await findUsersByEmail(sharedEmail)
        expect(usersAfterFirst.length).toBe(1)
        const guestUserId = usersAfterFirst[0].id
        expect(await countUserOrgs(guestUserId, orgCtx.orgId)).toBe(1)

        // Second visit: NEW link on NEW doc, same email. OTP-verify must
        // re-use the existing users + user_org rows and only create the
        // ONE new drive_shares row for the new item.
        const secondDoc = await uploadStubFixture(`stub-otp-idem-2-${uniqueSuffix()}`)
        const secondLink = await createShareLink(secondDoc.id, 'commentor')

        const secondContext = await browser.newContext()
        try {
            const secondPage = await secondContext.newPage()
            await secondPage.goto(`/p/drive/share/${secondLink.token}`)
            await expect(secondPage.getByText('Stub share editor')).toBeVisible()
            await signInAsGuest(secondPage, sharedEmail)
            await expect(
                secondPage.getByText('Sign in to comment on this document', { exact: true })
            ).not.toBeVisible()
        } finally {
            await secondContext.close()
        }

        // Counts unchanged after second verify.
        const usersFinal = await findUsersByEmail(sharedEmail)
        expect(usersFinal.length).toBe(1)
        expect(await countUserOrgs(guestUserId, orgCtx.orgId)).toBe(1)
    })
})
