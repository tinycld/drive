import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import type { DriveItems } from '@tinycld/drive/types'
import { PenLine } from 'lucide-react-native'
import { useRouter } from 'one'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import { DataTableHeader } from '~/components/DataTableHeader'
import { EmptyState } from '~/components/EmptyState'
import { formatDate } from '~/lib/format-utils'
import { useOrgHref } from '~/lib/org-routes'
import { useStore } from '~/lib/pocketbase'
import { useOrgInfo } from '~/lib/use-org-info'

const DOC_MIME_TYPE = 'application/vnd.tinycld.document'

export default function DocListScreen() {
    const { orgId } = useOrgInfo()
    const [driveItemsCollection] = useStore('drive_items')

    const { data: items } = useLiveQuery(
        query =>
            query
                .from({ drive_items: driveItemsCollection })
                .where(
                    ({ drive_items }) =>
                        eq(drive_items.org, orgId) && eq(drive_items.mime_type, DOC_MIME_TYPE)
                )
                .orderBy(({ drive_items }) => drive_items.updated, 'desc'),
        [orgId]
    )

    const docs = items ?? []

    if (docs.length === 0) {
        return <EmptyState message="No documents yet" />
    }

    return (
        <View style={styles.container}>
            <DataTableHeader columns={COLUMNS} />
            {docs.map(doc => (
                <DocRow key={doc.id} item={doc} />
            ))}
        </View>
    )
}

const COLUMNS = [
    { label: 'Title', flex: 3 },
    { label: 'Last modified', flex: 2 },
]

function DocRow({ item }: { item: DriveItems }) {
    const theme = useTheme()
    const router = useRouter()
    const orgHref = useOrgHref()

    return (
        <Pressable
            onPress={() => router.push(orgHref('docs/[id]', { id: item.id }))}
            style={[styles.row, { borderBottomColor: theme.borderColor.val }]}
        >
            <View style={[styles.titleCell, { flex: 3 }]}>
                <PenLine size={18} color={theme.accentBackground.val} />
                <Text style={[styles.titleText, { color: theme.color.val }]} numberOfLines={1}>
                    {item.name}
                </Text>
            </View>
            <Text style={[styles.cellText, { color: theme.color8.val, flex: 2 }]}>
                {formatDate(item.updated)}
            </Text>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    titleCell: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    titleText: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    cellText: {
        fontSize: 13,
    },
})
