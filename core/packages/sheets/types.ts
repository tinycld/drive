import type { DriveItems } from '@tinycld/drive/types'
import type { UserOrg } from '~/types/pbSchema'

export interface SheetsWorkbooks {
    id: string
    drive_item: string
    created: string
    updated: string
}

export interface SheetsSnapshots {
    id: string
    workbook: string
    state: string
    update_count: number
    created: string
    updated: string
}

export interface SheetsUpdates {
    id: string
    workbook: string
    data: string
    user_org: string
    seq: number
    created: string
    updated: string
}

export interface WorkbookListItem {
    id: string
    workbookId: string
    name: string
    description: string
    owner: string
    ownerUserOrgId: string
    updated: string
    shared: boolean
}

export const SHEETS_MIME_TYPE = 'application/vnd.tinycld.spreadsheet'

export type SheetsSchema = {
    sheets_workbooks: {
        type: SheetsWorkbooks
        relations: {
            drive_item: DriveItems
        }
    }
    sheets_snapshots: {
        type: SheetsSnapshots
        relations: {
            workbook: SheetsWorkbooks
        }
    }
    sheets_updates: {
        type: SheetsUpdates
        relations: {
            workbook: SheetsWorkbooks
            user_org: UserOrg
        }
    }
}

// Re-export for convenience
export type { DriveShares as DriveShareRole } from '@tinycld/drive/types'
