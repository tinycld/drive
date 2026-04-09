import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useParams } from 'one'
import { Text, View } from 'react-native'
import { useTheme, YStack } from 'tamagui'
import { useStore } from '~/lib/pocketbase'
import { useCurrentUserOrg } from '~/lib/use-current-user-org'
import { useOrgSlug } from '~/lib/use-org-slug'
import { FormulaBar } from '../components/FormulaBar'
import { SheetTabs } from '../components/SheetTabs'
import { SpreadsheetGrid } from '../components/SpreadsheetGrid'
import { SpreadsheetToolbar } from '../components/SpreadsheetToolbar'
import { SpreadsheetContext, useSpreadsheetState } from '../hooks/useSpreadsheet'
import { useWorkbookRole } from '../hooks/useWorkbookRole'
import { useYjsSync } from '../hooks/useYjsSync'

export default function SpreadsheetEditorScreen() {
    const { id = '' } = useParams<{ id: string }>()
    const orgSlug = useOrgSlug()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''
    const role = useWorkbookRole(id)
    const isReadOnly = role === 'viewer'

    // Look up the workbook record from the drive_item id
    const [workbooksCollection] = useStore('sheets_workbooks')
    const { data: workbooks } = useLiveQuery(
        query => query.from({ wb: workbooksCollection }).where(({ wb }) => eq(wb.drive_item, id)),
        [id]
    )
    const workbookId = workbooks?.[0]?.id ?? ''

    const { doc, isSynced } = useYjsSync({ workbookId, userOrgId })

    if (!workbookId || !isSynced || !doc) {
        return <LoadingView />
    }

    return <SpreadsheetInner doc={doc} isReadOnly={isReadOnly} />
}

function LoadingView() {
    const theme = useTheme()
    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: theme.color8.val, fontSize: 14 }}>Loading spreadsheet...</Text>
        </View>
    )
}

function SpreadsheetInner({
    doc,
    isReadOnly,
}: {
    doc: NonNullable<ReturnType<typeof useYjsSync>['doc']>
    isReadOnly: boolean
}) {
    const state = useSpreadsheetState({ doc, isReadOnly })

    return (
        <SpreadsheetContext.Provider value={state}>
            <YStack flex={1}>
                <SpreadsheetToolbar />
                <FormulaBar />
                <SpreadsheetGrid />
                <SheetTabs />
            </YStack>
        </SpreadsheetContext.Provider>
    )
}
