export interface MockEmail {
    id: string
    sender: string
    senderEmail: string
    subject: string
    preview: string
    body: string
    date: string
    isRead: boolean
    isStarred: boolean
    folder: string
    labels: string[]
    threadCount?: number
}

export interface MockLabel {
    id: string
    name: string
    color: string
}

export const mockLabels: MockLabel[] = [
    { id: 'l1', name: 'Work', color: '#4285f4' },
    { id: 'l2', name: 'Personal', color: '#0f9d58' },
    { id: 'l3', name: 'Finance', color: '#f4b400' },
    { id: 'l4', name: 'Travel', color: '#db4437' },
]

export const mockEmails: MockEmail[] = [
    {
        id: '1',
        sender: 'Alice Chen',
        senderEmail: 'alice.chen@example.com',
        subject: 'Q2 Product Roadmap Review',
        preview:
            "Hi team, I've attached the updated Q2 roadmap with the changes we discussed in yesterday's meeting. Please review and add any comments before Friday.",
        body: "<p>Hi team,</p><p>I've attached the updated Q2 roadmap with the changes we discussed in yesterday's meeting. Please review and add any comments before Friday.</p><p>Key changes include:</p><ul><li>Moved the billing migration to Sprint 14</li><li>Added the new onboarding flow to Sprint 12</li><li>Deprioritized the analytics dashboard redesign</li></ul><p>Let me know if you have questions.</p><p>Best,<br/>Alice</p>",
        date: '10:42 AM',
        isRead: false,
        isStarred: true,
        folder: 'inbox',
        labels: ['l1'],
        threadCount: 3,
    },
    {
        id: '2',
        sender: 'GitHub',
        senderEmail: 'notifications@github.com',
        subject: '[tinycld/app] Fix: resolve subdomain redirect loop (#247)',
        preview:
            'nathanstitt merged pull request #247 into main. The redirect loop when navigating between org subdomains has been resolved.',
        body: '<p><strong>nathanstitt</strong> merged pull request <a href="#">#247</a> into <code>main</code>.</p><p>The redirect loop when navigating between org subdomains has been resolved by checking the current hostname before triggering a redirect.</p><p>Files changed: 3<br/>Additions: 42<br/>Deletions: 18</p>',
        date: '9:15 AM',
        isRead: true,
        isStarred: false,
        folder: 'inbox',
        labels: [],
    },
    {
        id: '3',
        sender: 'Marcus Johnson',
        senderEmail: 'marcus.j@example.com',
        subject: 'Lunch tomorrow?',
        preview:
            "Hey! Are you free for lunch tomorrow around noon? There's a new Thai place on 5th that just opened.",
        body: "<p>Hey!</p><p>Are you free for lunch tomorrow around noon? There's a new Thai place on 5th that just opened. Heard great things about their pad see ew.</p><p>Let me know!</p><p>Marcus</p>",
        date: 'Yesterday',
        isRead: true,
        isStarred: false,
        folder: 'inbox',
        labels: ['l2'],
    },
    {
        id: '4',
        sender: 'Stripe',
        senderEmail: 'receipts@stripe.com',
        subject: 'Your receipt from TinyCld',
        preview:
            'Payment of $49.00 for TinyCld Pro Plan (Monthly) was successfully processed on April 1, 2026.',
        body: '<p>Payment of <strong>$49.00</strong> for TinyCld Pro Plan (Monthly) was successfully processed on April 1, 2026.</p><p>Invoice #INV-2026-0401</p><p>If you have any questions about this charge, please contact support.</p>',
        date: 'Apr 1',
        isRead: true,
        isStarred: false,
        folder: 'inbox',
        labels: ['l3'],
    },
    {
        id: '5',
        sender: 'Sarah Kim',
        senderEmail: 'sarah.kim@example.com',
        subject: 'Re: Conference travel arrangements',
        preview:
            "I've booked the flights for the team. Departing SFO on the 15th at 8:30 AM, returning on the 18th.",
        body: "<p>I've booked the flights for the team. Here are the details:</p><p><strong>Departure:</strong> SFO → JFK, April 15, 8:30 AM<br/><strong>Return:</strong> JFK → SFO, April 18, 6:15 PM</p><p>Hotel reservations are at the Marriott Marquis in Times Square. I'll send the confirmation numbers separately.</p><p>Sarah</p>",
        date: 'Mar 30',
        isRead: false,
        isStarred: true,
        folder: 'inbox',
        labels: ['l1', 'l4'],
        threadCount: 5,
    },
    {
        id: '6',
        sender: 'Me',
        senderEmail: 'me@example.com',
        subject: 'Draft: Monthly newsletter',
        preview:
            "Here's the draft for this month's newsletter. Still need to add the section about new features.",
        body: "<p>Here's the draft for this month's newsletter. Still need to add the section about new features and the customer spotlight.</p><p>TODO:</p><ul><li>Add new features section</li><li>Customer spotlight: Acme Corp</li><li>Proofread and finalize</li></ul>",
        date: 'Mar 28',
        isRead: true,
        isStarred: false,
        folder: 'drafts',
        labels: [],
    },
    {
        id: '7',
        sender: 'Me',
        senderEmail: 'me@example.com',
        subject: 'Team standup notes — March 27',
        preview:
            "Quick summary from today's standup: API migration on track, mobile app release pushed to next week.",
        body: "<p>Quick summary from today's standup:</p><ul><li>API migration on track for Friday deploy</li><li>Mobile app release pushed to next week due to App Store review delays</li><li>New hire starting Monday — onboarding buddy: Marcus</li></ul>",
        date: 'Mar 27',
        isRead: true,
        isStarred: false,
        folder: 'sent',
        labels: ['l1'],
    },
]

export function getEmailById(id: string) {
    return mockEmails.find(e => e.id === id) ?? null
}

export function getEmailsByFolder(folder: string) {
    return mockEmails.filter(e => e.folder === folder)
}

export function getEmailsByLabel(labelId: string) {
    return mockEmails.filter(e => e.labels.includes(labelId))
}

export const folderCounts = {
    inbox: mockEmails.filter(e => e.folder === 'inbox' && !e.isRead).length,
    drafts: mockEmails.filter(e => e.folder === 'drafts').length,
    sent: mockEmails.filter(e => e.folder === 'sent').length,
    starred: mockEmails.filter(e => e.isStarred).length,
}
