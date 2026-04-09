import type { DriveItems } from '@tinycld/drive/types'

export interface DocContents {
    id: string
    file_item: string
    content_json: string
    content_html: string
    word_count: number
    created: string
    updated: string
}

export type DocsSchema = {
    doc_contents: {
        type: DocContents
        relations: {
            file_item: DriveItems
        }
    }
}
