/**
 * Converts a zero-based column index to a column letter (0 → A, 25 → Z, 26 → AA).
 */
export function colIndexToLetter(index: number): string {
    let result = ''
    let n = index
    while (n >= 0) {
        result = String.fromCharCode((n % 26) + 65) + result
        n = Math.floor(n / 26) - 1
    }
    return result
}

/**
 * Converts a column letter to a zero-based index (A → 0, Z → 25, AA → 26).
 */
export function letterToColIndex(letter: string): number {
    let result = 0
    for (let i = 0; i < letter.length; i++) {
        result = result * 26 + (letter.charCodeAt(i) - 64)
    }
    return result - 1
}

/**
 * Builds a cell key for Y.Map lookup: "sheetId:row:col"
 */
export function cellKey(sheetId: string, row: number, col: number): string {
    return `${sheetId}:${row}:${col}`
}

/**
 * Parses a cell key back into its components.
 */
export function parseCellKey(key: string): { sheetId: string; row: number; col: number } {
    const parts = key.split(':')
    return {
        sheetId: parts[0],
        row: Number.parseInt(parts[1], 10),
        col: Number.parseInt(parts[2], 10),
    }
}

/**
 * Converts a cell reference like "A1" to { row, col } (zero-based).
 */
export function cellRefToRowCol(ref: string): { row: number; col: number } {
    const match = ref.match(/^([A-Z]+)(\d+)$/)
    if (!match) return { row: 0, col: 0 }
    return {
        row: Number.parseInt(match[2], 10) - 1,
        col: letterToColIndex(match[1]),
    }
}

/**
 * Converts row/col (zero-based) to a cell reference like "A1".
 */
export function rowColToCellRef(row: number, col: number): string {
    return `${colIndexToLetter(col)}${row + 1}`
}

export type CellType = 'text' | 'number' | 'formula' | 'boolean' | 'date' | 'empty'

export interface CellData {
    value: string
    computed?: string
    type: CellType
    format?: string
    bold?: boolean
    italic?: boolean
    align?: 'left' | 'center' | 'right'
    textColor?: string
    bgColor?: string
}

export const DEFAULT_COL_WIDTH = 100
export const DEFAULT_ROW_HEIGHT = 28
export const HEADER_HEIGHT = 28
export const ROW_HEADER_WIDTH = 50

/**
 * Infers the cell type from a raw value string.
 */
export function inferCellType(value: string): CellType {
    if (!value) return 'empty'
    if (value.startsWith('=')) return 'formula'
    if (value === 'true' || value === 'false') return 'boolean'
    if (!Number.isNaN(Number(value)) && value.trim() !== '') return 'number'
    return 'text'
}

/**
 * Default sheet ID for new workbooks.
 */
export function defaultSheetId(): string {
    return 'sheet1'
}

/**
 * Default sheet metadata.
 */
export function defaultSheetMeta(name = 'Sheet 1') {
    return { name, position: 0, frozenRows: 0, frozenCols: 0 }
}
