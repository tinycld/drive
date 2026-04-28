import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type PocketBase from 'pocketbase'

function log(...args: unknown[]) {
    process.stdout.write(`[seed:drive] ${args.join(' ')}\n`)
}

interface SeedContext {
    user: { id: string; email: string; name: string }
    org: { id: string }
    userOrg: { id: string }
}

const ASSETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/assets')

const ASSET_FILES = {
    docx: {
        filename: 'sample.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    xlsx: {
        filename: 'sample.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    pptx: {
        filename: 'sample.pptx',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    pdf: { filename: 'sample.pdf', mime: 'application/pdf' },
    png: { filename: 'sample.png', mime: 'image/png' },
    jpg: { filename: 'sample.jpg', mime: 'image/jpeg' },
} as const

type AssetKey = keyof typeof ASSET_FILES

function loadAsset(key: AssetKey): { blob: Blob; size: number; mime: string; filename: string } {
    const asset = ASSET_FILES[key]
    const filePath = resolve(ASSETS_DIR, asset.filename)
    const buffer = readFileSync(filePath)
    return {
        blob: new Blob([buffer], { type: asset.mime }),
        size: buffer.byteLength,
        mime: asset.mime,
        filename: asset.filename,
    }
}

// Folder structure: root folders and nested subfolders
const FOLDERS = [
    { key: 'projects', name: 'Projects', parent: null },
    { key: 'shared-docs', name: 'Shared Documents', parent: null },
    { key: 'personal', name: 'Personal', parent: null },
    { key: 'archive', name: 'Archive', parent: null },
    { key: 'q1-planning', name: 'Q1 Planning', parent: 'projects' },
    { key: 'marketing', name: 'Marketing', parent: 'projects' },
    { key: 'engineering', name: 'Engineering', parent: 'projects' },
    { key: 'api-docs', name: 'API Documentation', parent: 'engineering' },
] as const

const FILES: {
    name: string
    asset: AssetKey
    folder: string
    shared: boolean
    starred: boolean
    description: string
}[] = [
    // Q1 Planning
    {
        name: 'Product Roadmap 2026.docx',
        asset: 'docx',
        folder: 'q1-planning',
        shared: true,
        starred: true,
        description: 'Full product roadmap for 2026',
    },
    {
        name: 'Q1 Budget.xlsx',
        asset: 'xlsx',
        folder: 'q1-planning',
        shared: true,
        starred: false,
        description: 'Quarterly budget breakdown',
    },
    {
        name: 'Strategy Deck.pptx',
        asset: 'pptx',
        folder: 'q1-planning',
        shared: true,
        starred: false,
        description: '',
    },

    // Marketing
    {
        name: 'Brand Guidelines.pdf',
        asset: 'pdf',
        folder: 'marketing',
        shared: true,
        starred: false,
        description: 'Official brand guide v3',
    },
    {
        name: 'Logo Variants.png',
        asset: 'png',
        folder: 'marketing',
        shared: false,
        starred: false,
        description: '',
    },
    {
        name: 'Social Media Plan.docx',
        asset: 'docx',
        folder: 'marketing',
        shared: true,
        starred: false,
        description: 'Q2 social media strategy',
    },

    // Engineering
    {
        name: 'Architecture Overview.docx',
        asset: 'docx',
        folder: 'engineering',
        shared: true,
        starred: false,
        description: 'System architecture and design decisions',
    },
    {
        name: 'System Diagram.png',
        asset: 'png',
        folder: 'engineering',
        shared: false,
        starred: true,
        description: '',
    },

    // API Documentation
    {
        name: 'API v2 Reference.pdf',
        asset: 'pdf',
        folder: 'api-docs',
        shared: true,
        starred: false,
        description: 'Complete API v2 documentation',
    },
    {
        name: 'API Usage Metrics.xlsx',
        asset: 'xlsx',
        folder: 'api-docs',
        shared: true,
        starred: false,
        description: '',
    },

    // Shared Documents
    {
        name: 'Team Meeting Notes.docx',
        asset: 'docx',
        folder: 'shared-docs',
        shared: true,
        starred: false,
        description: 'Weekly meeting notes',
    },
    {
        name: 'Team Roster.xlsx',
        asset: 'xlsx',
        folder: 'shared-docs',
        shared: true,
        starred: false,
        description: '',
    },
    {
        name: 'Onboarding Slides.pptx',
        asset: 'pptx',
        folder: 'shared-docs',
        shared: true,
        starred: true,
        description: 'New hire onboarding deck',
    },

    // Personal
    {
        name: 'Resume 2026.docx',
        asset: 'docx',
        folder: 'personal',
        shared: false,
        starred: false,
        description: '',
    },
    {
        name: 'Profile Photo.jpg',
        asset: 'jpg',
        folder: 'personal',
        shared: false,
        starred: false,
        description: '',
    },
    {
        name: 'Tax Documents 2025.pdf',
        asset: 'pdf',
        folder: 'personal',
        shared: false,
        starred: false,
        description: '',
    },

    // Archive
    {
        name: 'Client Proposal (Old).docx',
        asset: 'docx',
        folder: 'archive',
        shared: false,
        starred: false,
        description: '',
    },
    {
        name: '2025 Financials.xlsx',
        asset: 'xlsx',
        folder: 'archive',
        shared: true,
        starred: false,
        description: 'Annual financial summary',
    },
]

async function seedFolders(pb: PocketBase, orgId: string, userOrgId: string) {
    const folderIds: Record<string, string> = {}

    for (const folder of FOLDERS) {
        log(`Creating folder: ${folder.name}`)
        const record = await pb.collection('drive_items').create({
            org: orgId,
            name: folder.name,
            is_folder: true,
            mime_type: '',
            parent: folder.parent ? folderIds[folder.parent] : '',
            created_by: userOrgId,
            size: 0,
            description: '',
        })
        folderIds[folder.key] = record.id

        await pb.collection('drive_shares').create({
            item: record.id,
            user_org: userOrgId,
            role: 'owner',
            created_by: userOrgId,
        })
    }

    return folderIds
}

async function seedFiles(
    pb: PocketBase,
    orgId: string,
    userOrgId: string,
    folderIds: Record<string, string>,
    otherMembers: { id: string }[]
) {
    for (const file of FILES) {
        log(`Uploading file: ${file.name}`)
        const asset = loadAsset(file.asset)

        const formData = new FormData()
        formData.append('org', orgId)
        formData.append('name', file.name)
        formData.append('is_folder', 'false')
        formData.append('mime_type', asset.mime)
        formData.append('parent', folderIds[file.folder])
        formData.append('created_by', userOrgId)
        formData.append('size', String(asset.size))
        formData.append('description', file.description)
        formData.append('file', asset.blob, file.name)

        const record = await pb.collection('drive_items').create(formData)

        // Create owner share
        await pb.collection('drive_shares').create({
            item: record.id,
            user_org: userOrgId,
            role: 'owner',
            created_by: userOrgId,
        })

        // Share with a team member if marked as shared
        if (file.shared && otherMembers.length > 0) {
            const sharedWith = otherMembers[Math.floor(Math.random() * otherMembers.length)]
            await pb.collection('drive_shares').create({
                item: record.id,
                user_org: sharedWith.id,
                role: 'editor',
                created_by: userOrgId,
            })
        }

        // Create item state for starred items
        if (file.starred) {
            await pb.collection('drive_item_state').create({
                item: record.id,
                user_org: userOrgId,
                is_starred: true,
                trashed_at: '',
                last_viewed_at: new Date().toISOString(),
            })
        }
    }
}

async function seedFolderStars(
    pb: PocketBase,
    userOrgId: string,
    folderIds: Record<string, string>
) {
    // Star the Projects and Engineering folders
    const starredFolders = ['projects', 'engineering']
    for (const key of starredFolders) {
        if (folderIds[key]) {
            await pb.collection('drive_item_state').create({
                item: folderIds[key],
                user_org: userOrgId,
                is_starred: true,
                trashed_at: '',
                last_viewed_at: new Date().toISOString(),
            })
        }
    }
}

export default async function seed(pb: PocketBase, { org, userOrg }: SeedContext) {
    const existingItems = await pb.collection('drive_items').getList(1, 1, {
        filter: `org = "${org.id}"`,
    })
    if (existingItems.totalItems > 0) {
        log(`Skipping (${existingItems.totalItems} items already exist)`)
        return
    }

    const otherMembers = await pb.collection('user_org').getFullList({
        filter: `org = "${org.id}" && id != "${userOrg.id}"`,
    })

    const folderIds = await seedFolders(pb, org.id, userOrg.id)

    log(`Uploading ${FILES.length} files...`)
    await seedFiles(pb, org.id, userOrg.id, folderIds, otherMembers)

    await seedFolderStars(pb, userOrg.id, folderIds)

    log(`Created ${FOLDERS.length} folders and uploaded ${FILES.length} files`)
}
