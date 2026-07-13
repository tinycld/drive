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

    test('Download as ▸ PDF from the row context menu downloads a real PDF', async ({ page }) => {
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

        // Open the "Download as" submenu, then pick PDF.
        const submenu = page.getByText('Download as', { exact: true })
        await expect(submenu).toBeVisible()
        await submenu.hover()
        const pdfItem = page.getByText('PDF', { exact: true })
        await expect(pdfItem).toBeVisible()

        const downloadPromise = page.waitForEvent('download')
        await pdfItem.dispatchEvent('click')
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

    // The generalized route: convert a document to several targets and check the
    // Content-Type and a content signature for each. Read-only route probes.
    test('Download as: docx→html/txt, xlsx→csv', async () => {
        const token = await authTokenForTestUser()
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

        const docx = await uploadFileAsDriveItem({
            fixturePath: join(ASSETS, 'sample.docx'),
            name: `ConvertDocx-${stamp}.docx`,
            mimeType: DOCX_MIME,
        })
        const xlsx = await uploadFileAsDriveItem({
            fixturePath: join(ASSETS, 'sample.xlsx'),
            name: `ConvertXlsx-${stamp}.xlsx`,
            mimeType: XLSX_MIME,
        })

        const convert = async (itemId: string, to: string) => {
            const mint = await fetch(`${PB_URL}/api/drive/export-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: token },
                body: JSON.stringify({ item: itemId, to }),
            })
            expect(mint.status).toBe(200)
            const { url } = (await mint.json()) as { url: string }
            const res = await fetch(`${PB_URL}${url}`)
            expect(res.status).toBe(200)
            return res
        }

        const html = await convert(docx.id, 'html')
        expect(html.headers.get('content-type')).toBe('text/html')
        expect(html.headers.get('content-disposition')).toContain('.html')
        expect((await html.text()).length).toBeGreaterThan(0)

        const txt = await convert(docx.id, 'text')
        expect(txt.headers.get('content-type')).toBe('text/plain')
        expect(txt.headers.get('content-disposition')).toContain('.txt')

        const csv = await convert(xlsx.id, 'csv')
        expect(csv.headers.get('content-type')).toBe('text/csv')
        expect(csv.headers.get('content-disposition')).toContain('.csv')

        // An image is not a document workflow → refused.
        const fs = await import('node:fs')
        const os = await import('node:os')
        const png = join(os.tmpdir(), `NotADoc-${stamp}.png`)
        fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
        const img = await uploadFileAsDriveItem({
            fixturePath: png,
            name: `NotADoc-${stamp}.png`,
            mimeType: 'image/png',
        })
        const refuseImg = await fetch(`${PB_URL}/api/drive/export-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({ item: img.id, to: 'pdf' }),
        })
        expect(refuseImg.status).toBe(400)

        // An unsupported target is rejected.
        const badTarget = await fetch(`${PB_URL}/api/drive/export-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({ item: docx.id, to: 'png' }),
        })
        expect(badTarget.status).toBe(400)
    })

    // Single-sheet CSV via the `sheet` param. tiny.xlsx has two sheets —
    // "People" (contains "Dulce") and "Incomes" (contains "Table 1").
    test('Download as CSV: current sheet vs all sheets', async () => {
        const token = await authTokenForTestUser()
        const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

        const xlsx = await uploadFileAsDriveItem({
            fixturePath: join(ASSETS, 'tiny.xlsx'),
            name: `TwoSheets-${stamp}.xlsx`,
            mimeType: XLSX_MIME,
        })

        const csvText = async (body: Record<string, string>) => {
            const mint = await fetch(`${PB_URL}/api/drive/export-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: token },
                body: JSON.stringify({ item: xlsx.id, to: 'csv', ...body }),
            })
            expect(mint.status).toBe(200)
            const { url } = (await mint.json()) as { url: string }
            const res = await fetch(`${PB_URL}${url}`)
            expect(res.status).toBe(200)
            return res.text()
        }

        // All sheets: both People and Incomes content.
        const all = await csvText({})
        expect(all).toContain('Dulce')
        expect(all).toContain('Table 1')

        // Current sheet "People": People content only, Incomes excluded.
        const people = await csvText({ sheet: 'People' })
        expect(people).toContain('Dulce')
        expect(people).not.toContain('Table 1')

        // Unknown sheet → 400 (ErrSheetNotFound).
        const bad = await fetch(`${PB_URL}/api/drive/export-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify({ item: xlsx.id, to: 'csv', sheet: 'Nope' }),
        })
        // The sheet is only validated at conversion time (the mint token
        // succeeds; the GET fails). Mirror that: mint ok, then GET 400.
        expect(bad.status).toBe(200)
        const { url } = (await bad.json()) as { url: string }
        const badRes = await fetch(`${PB_URL}${url}`)
        expect(badRes.status).toBe(400)
    })
})
