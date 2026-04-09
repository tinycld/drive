import { useRouter } from 'one'
import { newRecordId } from 'pbtsdb'
import { YStack } from 'tamagui'
import { useMutation } from '~/lib/mutations'
import { useOrgHref } from '~/lib/org-routes'
import { useStore } from '~/lib/pocketbase'
import { useCurrentUserOrg } from '~/lib/use-current-user-org'
import { useOrgInfo } from '~/lib/use-org-info'
import { DocumentEditor } from '../components/DocumentEditor'
import { DocumentToolbar } from '../components/DocumentToolbar'
import { useDocumentEditor } from '../hooks/useDocumentEditor'

const DOC_MIME_TYPE = 'application/vnd.tinycld.document'

export default function NewDocumentScreen() {
    const router = useRouter()
    const orgHref = useOrgHref()
    const { orgSlug, orgId } = useOrgInfo()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''
    const [driveItemsCollection] = useStore('drive_items')
    const [driveSharesCollection] = useStore('drive_shares')
    const [docContentsCollection] = useStore('doc_contents')
    const editor = useDocumentEditor()

    const create = useMutation({
        mutationFn: function* () {
            const fileItemId = newRecordId()

            yield driveItemsCollection.insert({
                id: fileItemId,
                org: orgId,
                name: 'Untitled document',
                is_folder: false,
                mime_type: DOC_MIME_TYPE,
                parent: '',
                created_by: userOrgId,
                size: 0,
                file: '',
                description: '',
            })

            yield driveSharesCollection.insert({
                id: newRecordId(),
                item: fileItemId,
                user_org: userOrgId,
                role: 'owner',
                created_by: userOrgId,
            })

            yield docContentsCollection.insert({
                id: newRecordId(),
                file_item: fileItemId,
                content_json: '',
                content_html: '',
                word_count: 0,
            })

            return fileItemId
        },
        onSuccess: fileItemId => {
            router.replace(orgHref('docs/[id]', { id: fileItemId as string }))
        },
    })

    const handleBack = () => {
        if (create.isPending) return
        create.mutate()
    }

    return (
        <YStack flex={1}>
            <DocumentToolbar editor={editor} onBack={handleBack} />
            <DocumentEditor editor={editor} />
        </YStack>
    )
}
