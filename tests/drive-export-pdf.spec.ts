import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { login, navigateToPackage } from '@tinycld/core/e2e-helpers'
import {
    authTokenForTestUser,
    dismissErrorOverlay,
    driveItem,
    uploadFileAsDriveItem,
} from './helpers'

const PB_URL = 'http://127.0.0.1:7200'
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), 'assets')

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function readDownloadHead(download: import('@playwright/test').Download): Promise<string> {
    const fs = await import('node:fs')
    const path = await download.path()
    const buf = fs.readFileSync(path)
    return buf.subarray(0, 5).toString('latin1')
}

test.describe('Drive — Export to PDF', () => {
    test.beforeEach(async ({ page }) => {
        await login(page)
        await navigateToPackage(page, 'drive', {
            waitFor: page.getByTestId('package-sidebar-mounted'),
        })
        await dismissErrorOverlay(page)
    })

    test('Export to PDF from the row context menu downloads a real PDF', async ({ page }) => {
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        const fileName = `ExportDocx-${stamp}.docx`
        await uploadFileAsDriveItem({
            fixturePath: join(ASSETS, 'sample.docx'),
            name: fileName,
            mimeType: DOCX_MIME,
        })

        await page.getByPlaceholder('Search in Files').fill(fileName)
        await expect(driveItem(page, fileName)).toBeVisible()
        await driveItem(page, fileName).click({ button: 'right' })

        const exportItem = page.getByText('Export to PDF', { exact: true })
        await expect(exportItem).toBeVisible()

        const downloadPromise = page.waitForEvent('download')
        await exportItem.dispatchEvent('click')
        const download = await downloadPromise

        // Filename swaps .docx -> .pdf, and the bytes are a real PDF.
        expect(download.suggestedFilename()).toMatch(/\.pdf$/)
        expect(await readDownloadHead(download)).toBe('%PDF-')
    })

    // Read-only route probes (allowed for assertions): exercise the
    // export-token + export endpoints directly for the edges the UI can't
    // easily reach.
    test('route probes: token mint, streamed PDF, and refusals', async () => {
        const token = await authTokenForTestUser()
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

        const xlsx = await uploadFileAsDriveItem({
            fixturePath: join(ASSETS, 'sample.xlsx'),
            name: `ExportXlsx-${stamp}.xlsx`,
            mimeType: XLSX_MIME,
        })

        // Happy path: mint a token, then GET the export — a real PDF streams.
        const mint = await fetch(`${PB_URL}/api/drive/export-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({ item: xlsx.id, to: 'pdf' }),
        })
        expect(mint.status).toBe(200)
        const { url } = (await mint.json()) as { url: string }
        expect(url).toMatch(/^\/api\/drive\/export\?token=/)

        const pdf = await fetch(`${PB_URL}${url}`)
        expect(pdf.status).toBe(200)
        expect(pdf.headers.get('content-type')).toBe('application/pdf')
        const head = new Uint8Array(await pdf.arrayBuffer()).subarray(0, 5)
        expect(Buffer.from(head).toString('latin1')).toBe('%PDF-')

        // Single-use: replaying the same token 401s.
        const replay = await fetch(`${PB_URL}${url}`)
        expect(replay.status).toBe(401)

        // Unauthenticated token mint is rejected.
        const noAuth = await fetch(`${PB_URL}/api/drive/export-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item: xlsx.id }),
        })
        expect(noAuth.status).toBe(401)

        // A PDF item can't be exported to PDF (ErrSameFormat → 400).
        const fs = await import('node:fs')
        const os = await import('node:os')
        const pdfFixture = join(os.tmpdir(), `AlreadyPdf-${stamp}.pdf`)
        fs.writeFileSync(pdfFixture, '%PDF-1.4\n%probe\n')
        const already = await uploadFileAsDriveItem({
            fixturePath: pdfFixture,
            name: `AlreadyPdf-${stamp}.pdf`,
            mimeType: 'application/pdf',
        })
        const refusePdf = await fetch(`${PB_URL}/api/drive/export-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({ item: already.id, to: 'pdf' }),
        })
        expect(refusePdf.status).toBe(400)
    })
})
