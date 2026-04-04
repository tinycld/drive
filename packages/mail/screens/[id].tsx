import { useParams } from 'one'
import { ScrollView, YStack } from 'tamagui'
import { EmailBody } from '../components/EmailBody'
import { EmailDetailToolbar } from '../components/EmailDetailToolbar'
import { EmailHeader } from '../components/EmailHeader'
import { InlineReply } from '../components/InlineReply'
import { getEmailById } from '../components/mockData'
import { NotFoundState } from '../components/NotFoundState'

export default function MailDetailScreen() {
    const { id = '' } = useParams<{ id: string }>()

    const email = getEmailById(id)

    if (!email) return <NotFoundState message="Email not found" />

    return (
        <YStack flex={1} backgroundColor="$background">
            <EmailDetailToolbar />
            <ScrollView flex={1} contentContainerStyle={{ flexGrow: 1 }}>
                <EmailHeader email={email} />
                <EmailBody html={email.body} />
                <InlineReply />
            </ScrollView>
        </YStack>
    )
}
