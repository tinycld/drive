import { useMemo } from 'react'
import { ScrollView, SizableText, YStack } from 'tamagui'
import { EmailListToolbar } from '../components/EmailListToolbar'
import { EmailRow } from '../components/EmailRow'
import { getEmailsByFolder, getEmailsByLabel, mockEmails } from '../components/mockData'

function useQueryParams() {
    if (typeof window === 'undefined') return { folder: 'inbox', label: null }
    const params = new URLSearchParams(window.location.search)
    return {
        folder: params.get('folder'),
        label: params.get('label'),
    }
}

function EmptyState({ folderTitle, isVisible }: { folderTitle: string; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$8">
            <SizableText size="$4" color="$color8">
                No conversations in {folderTitle}
            </SizableText>
        </YStack>
    )
}

function EmailList({ emails, isVisible }: { emails: typeof mockEmails; isVisible: boolean }) {
    if (!isVisible) return null

    const rows = emails.map(email => <EmailRow key={email.id} email={email} />)

    return <ScrollView flex={1}>{rows}</ScrollView>
}

export default function MailListScreen() {
    const { folder, label } = useQueryParams()

    const emails = useMemo(() => {
        if (label) return getEmailsByLabel(label)
        if (folder === 'starred') return mockEmails.filter(e => e.isStarred)
        return getEmailsByFolder(folder ?? 'inbox')
    }, [folder, label])

    const folderTitle = label
        ? 'Label'
        : (folder ?? 'inbox').charAt(0).toUpperCase() + (folder ?? 'inbox').slice(1)

    const isEmpty = emails.length === 0

    return (
        <YStack flex={1}>
            <EmailListToolbar emailCount={emails.length} />
            <EmptyState folderTitle={folderTitle} isVisible={isEmpty} />
            <EmailList emails={emails} isVisible={!isEmpty} />
        </YStack>
    )
}
