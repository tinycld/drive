import type PocketBase from 'pocketbase'

function log(...args: unknown[]) {
    process.stdout.write(`[seed:docs] ${args.join(' ')}\n`)
}

interface SeedContext {
    user: { id: string; email: string; name: string }
    org: { id: string }
    userOrg: { id: string }
}

const DOC_MIME_TYPE = 'application/vnd.tinycld.document'

const SAMPLE_DOCS = [
    {
        name: 'Project Kickoff Notes',
        content_html:
            '<h1>Project Kickoff</h1><p>Welcome to the project! This document outlines our goals and timeline.</p><h2>Goals</h2><ul><li>Launch MVP by end of Q2</li><li>Onboard first 10 customers</li><li>Establish feedback loop</li></ul><h2>Timeline</h2><p>We plan to work in two-week sprints, starting next Monday.</p>',
        shared: true,
    },
    {
        name: 'Meeting Agenda - Weekly Sync',
        content_html:
            '<h1>Weekly Sync</h1><h2>Agenda</h2><ol><li>Status updates</li><li>Blockers</li><li>Action items from last week</li><li>Open discussion</li></ol>',
        shared: true,
    },
    {
        name: 'API Design Proposal',
        content_html:
            '<h1>API Design Proposal</h1><p>This document proposes the REST API structure for our public-facing endpoints.</p><h2>Authentication</h2><p>All requests require a Bearer token in the Authorization header.</p><h2>Endpoints</h2><p><strong>GET /api/v1/resources</strong> — List all resources</p><p><strong>POST /api/v1/resources</strong> — Create a new resource</p><p><strong>GET /api/v1/resources/:id</strong> — Get a single resource</p>',
        shared: false,
    },
    {
        name: 'Onboarding Guide',
        content_html:
            '<h1>New Hire Onboarding</h1><p>Welcome aboard! Here is everything you need to get started.</p><h2>Day 1</h2><ul><li>Set up your development environment</li><li>Read the architecture overview</li><li>Meet your team lead</li></ul><h2>Week 1</h2><ul><li>Complete your first code review</li><li>Ship your first small PR</li></ul>',
        shared: true,
    },
    {
        name: 'Personal Notes',
        content_html:
            '<h1>Notes</h1><p>Random thoughts and ideas to follow up on later.</p><ul><li>Look into caching strategy for search</li><li>Refactor the notification system</li></ul>',
        shared: false,
    },
] as const

function wordCount(html: string): number {
    const text = html.replace(/<[^>]+>/g, ' ').trim()
    return text ? text.split(/\s+/).length : 0
}

export default async function seed(pb: PocketBase, { org, userOrg }: SeedContext) {
    const existing = await pb.collection('doc_contents').getList(1, 1)
    if (existing.totalItems > 0) {
        log(`Skipping (${existing.totalItems} documents already exist)`)
        return
    }

    const otherMembers = await pb.collection('user_org').getFullList({
        filter: `org = "${org.id}" && id != "${userOrg.id}"`,
    })

    for (const doc of SAMPLE_DOCS) {
        log(`Creating document: ${doc.name}`)

        const fileItem = await pb.collection('drive_items').create({
            org: org.id,
            name: doc.name,
            is_folder: false,
            mime_type: DOC_MIME_TYPE,
            parent: '',
            created_by: userOrg.id,
            size: 0,
            description: '',
        })

        await pb.collection('drive_shares').create({
            item: fileItem.id,
            user_org: userOrg.id,
            role: 'owner',
            created_by: userOrg.id,
        })

        if (doc.shared && otherMembers.length > 0) {
            const sharedWith = otherMembers[Math.floor(Math.random() * otherMembers.length)]
            await pb.collection('drive_shares').create({
                item: fileItem.id,
                user_org: sharedWith.id,
                role: 'editor',
                created_by: userOrg.id,
            })
        }

        await pb.collection('doc_contents').create({
            file_item: fileItem.id,
            content_json: '',
            content_html: doc.content_html,
            word_count: wordCount(doc.content_html),
        })
    }

    log(`Created ${SAMPLE_DOCS.length} documents`)
}
