import type PocketBase from 'pocketbase'
import { SHEETS_MIME_TYPE } from './types'

function log(...args: unknown[]) {
    process.stdout.write(`[seed:sheets] ${args.join(' ')}\n`)
}

interface SeedContext {
    user: { id: string; email: string; name: string }
    org: { id: string }
    userOrg: { id: string }
}

const SAMPLE_WORKBOOKS = [
    {
        name: 'Q1 Budget',
        description: 'Quarterly budget breakdown and forecasts',
    },
    {
        name: 'Team Roster',
        description: 'Team members and roles',
    },
    {
        name: 'Project Tracker',
        description: '',
    },
] as const

export default async function seed(pb: PocketBase, { org, userOrg }: SeedContext) {
    const existing = await pb.collection('sheets_workbooks').getList(1, 1)
    if (existing.totalItems > 0) {
        log(`Skipping (${existing.totalItems} workbooks already exist)`)
        return
    }

    const otherMembers = await pb.collection('user_org').getFullList({
        filter: `org = "${org.id}" && id != "${userOrg.id}"`,
    })

    for (const wb of SAMPLE_WORKBOOKS) {
        log(`Creating workbook: ${wb.name}`)

        // Create the drive item
        const driveItem = await pb.collection('drive_items').create({
            org: org.id,
            name: wb.name,
            is_folder: false,
            mime_type: SHEETS_MIME_TYPE,
            parent: '',
            created_by: userOrg.id,
            size: 0,
            description: wb.description,
        })

        // Create owner share
        await pb.collection('drive_shares').create({
            item: driveItem.id,
            user_org: userOrg.id,
            role: 'owner',
            created_by: userOrg.id,
        })

        // Share the first workbook with a team member
        if (wb.name === 'Q1 Budget' && otherMembers.length > 0) {
            await pb.collection('drive_shares').create({
                item: driveItem.id,
                user_org: otherMembers[0].id,
                role: 'editor',
                created_by: userOrg.id,
            })
        }

        // Create the workbook link
        await pb.collection('sheets_workbooks').create({
            drive_item: driveItem.id,
        })
    }

    log(`Created ${SAMPLE_WORKBOOKS.length} workbooks`)
}
