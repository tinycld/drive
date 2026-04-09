import * as XLSX from 'xlsx'
import * as Y from 'yjs'
import { cellKey, defaultSheetMeta, inferCellType } from './cell-utils'

/**
 * Imports an Excel file (.xlsx/.xls/.csv) into a Y.Doc.
 * Clears existing doc content and replaces with imported data.
 */
export function importExcelToDoc(doc: Y.Doc, data: ArrayBuffer) {
    const workbook = XLSX.read(data, { type: 'array' })
    const sheetsMap = doc.getMap('sheets')
    const cellsMap = doc.getMap('cells')
    const colWidthsMap = doc.getMap('colWidths')

    doc.transact(() => {
        // Clear existing data
        sheetsMap.forEach((_, key) => {
            sheetsMap.delete(key)
        })
        cellsMap.forEach((_, key) => {
            cellsMap.delete(key)
        })
        colWidthsMap.forEach((_, key) => {
            colWidthsMap.delete(key)
        })

        workbook.SheetNames.forEach((sheetName, index) => {
            const sheetId = `sheet${index + 1}`
            const ws = workbook.Sheets[sheetName]

            // Create sheet metadata
            const meta = new Y.Map()
            const defaults = defaultSheetMeta(sheetName)
            meta.set('name', defaults.name)
            meta.set('position', index)
            meta.set('frozenRows', 0)
            meta.set('frozenCols', 0)
            sheetsMap.set(sheetId, meta)

            if (!ws) return

            // Import cell data
            const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
            for (let row = range.s.r; row <= range.e.r; row++) {
                for (let col = range.s.c; col <= range.e.c; col++) {
                    const cellAddr = XLSX.utils.encode_cell({ r: row, c: col })
                    const wsCell = ws[cellAddr]
                    if (!wsCell) continue

                    const key = cellKey(sheetId, row, col)
                    const cell = new Y.Map()

                    // Store formula if present, otherwise store value
                    if (wsCell.f) {
                        cell.set('value', `=${wsCell.f}`)
                        cell.set('type', 'formula')
                        if (wsCell.v !== undefined) {
                            cell.set('computed', String(wsCell.v))
                        }
                    } else {
                        const value = wsCell.v !== undefined ? String(wsCell.v) : ''
                        cell.set('value', value)
                        cell.set('type', inferCellType(value))
                    }

                    // Store number format if present
                    if (wsCell.z) {
                        cell.set('format', wsCell.z)
                    }

                    cellsMap.set(key, cell)
                }
            }

            // Import column widths
            const colWidths = ws['!cols']
            if (colWidths) {
                colWidths.forEach((colInfo, colIdx) => {
                    if (colInfo?.wpx) {
                        colWidthsMap.set(`${sheetId}:${colIdx}`, colInfo.wpx)
                    }
                })
            }
        })
    })
}

/**
 * Exports a Y.Doc to an Excel ArrayBuffer (.xlsx format).
 */
export function exportDocToExcel(doc: Y.Doc): ArrayBuffer {
    const sheetsMap = doc.getMap('sheets')
    const cellsMap = doc.getMap('cells')

    const workbook = XLSX.utils.book_new()

    // Sort sheets by position
    const sheetEntries: { id: string; name: string; position: number }[] = []
    sheetsMap.forEach((value, key) => {
        const meta = value as Y.Map<unknown>
        sheetEntries.push({
            id: key,
            name: (meta.get('name') as string) ?? key,
            position: (meta.get('position') as number) ?? 0,
        })
    })
    sheetEntries.sort((a, b) => a.position - b.position)

    for (const sheet of sheetEntries) {
        const wsData: (string | number | boolean | null)[][] = []
        let maxRow = 0
        let maxCol = 0

        // Collect cells for this sheet
        const sheetCells: {
            row: number
            col: number
            value: string
            type: string
            computed?: string
        }[] = []
        cellsMap.forEach((value, key) => {
            if (!key.startsWith(`${sheet.id}:`)) return
            const parts = key.split(':')
            const row = Number.parseInt(parts[1], 10)
            const col = Number.parseInt(parts[2], 10)
            const cell = value as Y.Map<unknown>
            sheetCells.push({
                row,
                col,
                value: (cell.get('value') as string) ?? '',
                type: (cell.get('type') as string) ?? 'text',
                computed: cell.get('computed') as string | undefined,
            })
            maxRow = Math.max(maxRow, row)
            maxCol = Math.max(maxCol, col)
        })

        // Build 2D array
        for (let r = 0; r <= maxRow; r++) {
            wsData[r] = Array.from({ length: maxCol + 1 }, () => null)
        }

        for (const cell of sheetCells) {
            const displayValue =
                cell.type === 'number'
                    ? Number(cell.value)
                    : cell.type === 'boolean'
                      ? cell.value === 'true'
                      : cell.value
            wsData[cell.row][cell.col] = displayValue
        }

        const ws = XLSX.utils.aoa_to_sheet(wsData)

        // Re-apply formulas
        for (const cell of sheetCells) {
            if (cell.type === 'formula' && cell.value.startsWith('=')) {
                const cellAddr = XLSX.utils.encode_cell({ r: cell.row, c: cell.col })
                if (ws[cellAddr]) {
                    ws[cellAddr].f = cell.value.slice(1)
                }
            }
        }

        XLSX.utils.book_append_sheet(workbook, ws, sheet.name)
    }

    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    return buffer
}
