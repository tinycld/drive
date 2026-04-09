import { Plus, Table2 } from 'lucide-react-native'
import type { OneRouter } from 'one'
import { useRouter } from 'one'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import { EmptyState } from '~/components/EmptyState'
import { formatDate } from '~/lib/format-utils'
import { useOrgSlug } from '~/lib/use-org-slug'
import { useSheets } from '../hooks/useSheets'
import type { WorkbookListItem } from '../types'

export default function SheetsScreen() {
    const { workbooks, isLoading, createWorkbook } = useSheets()
    const router = useRouter()
    const orgSlug = useOrgSlug()
    const theme = useTheme()

    const handleNew = () => {
        createWorkbook.mutate({ name: 'Untitled spreadsheet' })
    }

    if (isLoading) {
        return <EmptyState message="Loading..." />
    }

    if (workbooks.length === 0) {
        return (
            <EmptyState
                message="No spreadsheets yet"
                action={{ label: 'Create one', onPress: handleNew }}
            />
        )
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: theme.color.val }]}>Spreadsheets</Text>
                <Pressable
                    onPress={handleNew}
                    style={[styles.newButton, { backgroundColor: theme.accentBackground.val }]}
                >
                    <Plus size={16} color="white" />
                    <Text style={styles.newButtonText}>New</Text>
                </Pressable>
            </View>
            {workbooks.map(wb => (
                <WorkbookRow
                    key={wb.id}
                    workbook={wb}
                    onPress={() => router.push(`/a/${orgSlug}/sheets/${wb.id}` as OneRouter.Href)}
                />
            ))}
        </View>
    )
}

function WorkbookRow({ workbook, onPress }: { workbook: WorkbookListItem; onPress: () => void }) {
    const theme = useTheme()

    return (
        <Pressable
            onPress={onPress}
            style={[styles.row, { borderBottomColor: theme.borderColor.val }]}
        >
            <Table2 size={20} color={theme.green9.val} />
            <View style={styles.rowContent}>
                <Text style={[styles.rowName, { color: theme.color.val }]} numberOfLines={1}>
                    {workbook.name}
                </Text>
                <Text style={[styles.rowMeta, { color: theme.color8.val }]}>
                    {workbook.owner === 'me' ? 'me' : workbook.owner}
                    {' \u00B7 '}
                    {formatDate(workbook.updated)}
                </Text>
            </View>
            {workbook.shared && (
                <View
                    style={[
                        styles.sharedBadge,
                        { backgroundColor: `${theme.accentBackground.val}20` },
                    ]}
                >
                    <Text style={[styles.sharedBadgeText, { color: theme.accentBackground.val }]}>
                        Shared
                    </Text>
                </View>
            )}
        </Pressable>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
    },
    newButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
    },
    newButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    rowContent: {
        flex: 1,
        gap: 2,
    },
    rowName: {
        fontSize: 14,
        fontWeight: '500',
    },
    rowMeta: {
        fontSize: 12,
    },
    sharedBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    sharedBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
})
