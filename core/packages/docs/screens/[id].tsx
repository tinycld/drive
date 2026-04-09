import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useParams, useRouter } from 'one'
import { YStack } from 'tamagui'
import { EmptyState } from '~/components/EmptyState'
import { useMutation } from '~/lib/mutations'
import { useOrgHref } from '~/lib/org-routes'
import { useStore } from '~/lib/pocketbase'
import { useCurrentUserOrg } from '~/lib/use-current-user-org'
import { useOrgInfo } from '~/lib/use-org-info'
import { DocumentEditor } from '../components/DocumentEditor'
import { DocumentToolbar } from '../components/DocumentToolbar'
import { useDocumentEditor } from '../hooks/useDocumentEditor'

export default function DocumentDetailScreen() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const orgHref = useOrgHref()
    const { orgSlug } = useOrgInfo()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''
    const [driveSharesCollection] = useStore('drive_shares')
    const [docContentsCollection] = useStore('doc_contents')

    const { data: shares } = useLiveQuery(
        query =>
            query
                .from({ drive_shares: driveSharesCollection })
                .where(({ drive_shares }) => eq(drive_shares.item, id)),
        [id]
    )

    const currentShare = (shares ?? []).find(s => s.user_org === userOrgId)
    const isViewOnly = currentShare?.role === 'viewer'

    const { data: contents } = useLiveQuery(
        query =>
            query
                .from({ doc_contents: docContentsCollection })
                .where(({ doc_contents }) => eq(doc_contents.file_item, id)),
        [id]
    )

    const content = contents?.[0]

    const editor = useDocumentEditor({
        initialContent: content?.content_html || '',
        editable: !isViewOnly,
    })

    const save = useMutation({
        mutationFn: function* () {
            if (!content) return
            yield docContentsCollection.update(content.id, {
                content_html: '',
            })
        },
    })

    const handleBack = () => {
        if (!isViewOnly) {
            save.mutate()
        }
        router.push(orgHref('docs'))
    }

    if (!content) {
        return <EmptyState message="Document not found" />
    }

    return (
        <YStack flex={1}>
            <DocumentToolbar editor={editor} onBack={handleBack} />
            <DocumentEditor editor={editor} />
        </YStack>
    )
}
