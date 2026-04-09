import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { newRecordId } from 'pbtsdb'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useMutation } from '~/lib/mutations'
import { useStore } from '~/lib/pocketbase'
import { useCurrentUserOrg } from '~/lib/use-current-user-org'
import { useOrgInfo } from '~/lib/use-org-info'
import { SHEETS_MIME_TYPE, type WorkbookListItem } from '../types'

type SidebarSection = 'my-sheets' | 'shared-with-me' | 'recent'

interface SheetsContextValue {
    workbooks: WorkbookListItem[]
    isLoading: boolean
    activeSection: SidebarSection
    navigateToSection: (section: SidebarSection) => void
    createWorkbook: ReturnType<
        typeof useMutation<void, Error, { name: string; description?: string }>
    >
    deleteWorkbook: ReturnType<typeof useMutation<void, Error, string>>
}

export const SheetsContext = createContext<SheetsContextValue | null>(null)

export function useSheets(): SheetsContextValue {
    const ctx = useContext(SheetsContext)
    if (!ctx) throw new Error('useSheets must be used within SheetsProvider')
    return ctx
}

export function useSheetsState(): SheetsContextValue {
    const { orgSlug, orgId } = useOrgInfo()
    const userOrg = useCurrentUserOrg(orgSlug)
    const userOrgId = userOrg?.id ?? ''

    const [driveItemsCollection] = useStore('drive_items')
    const [driveSharesCollection] = useStore('drive_shares')
    const [workbooksCollection] = useStore('sheets_workbooks')
    const [userOrgCollection] = useStore('user_org')

    const [activeSection, setActiveSection] = useState<SidebarSection>('my-sheets')

    // Fetch all spreadsheet drive items for this org
    const { data: rawItems } = useLiveQuery(
        query =>
            query
                .from({ item: driveItemsCollection })
                .where(({ item }) =>
                    and(eq(item.org, orgId), eq(item.mime_type, SHEETS_MIME_TYPE))
                ),
        [orgId]
    )

    const { data: rawShares } = useLiveQuery(
        query => query.from({ share: driveSharesCollection }),
        []
    )

    const { data: rawWorkbooks } = useLiveQuery(
        query => query.from({ wb: workbooksCollection }),
        []
    )

    const { data: orgUserOrgs } = useLiveQuery(
        query => query.from({ uo: userOrgCollection }).where(({ uo }) => eq(uo.org, orgId)),
        [orgId]
    )

    const userOrgNames = useMemo(
        () =>
            new Map(
                (orgUserOrgs ?? []).map(uo => [
                    uo.id,
                    uo.expand?.user?.name || uo.expand?.user?.email || '',
                ])
            ),
        [orgUserOrgs]
    )

    const sharesByItem = useMemo(() => {
        const map = new Map<string, typeof rawShares>()
        for (const share of rawShares ?? []) {
            const list = map.get(share.item) ?? []
            list.push(share)
            map.set(share.item, list)
        }
        return map
    }, [rawShares])

    const workbookByDriveItem = useMemo(
        () => new Map((rawWorkbooks ?? []).map(wb => [wb.drive_item, wb])),
        [rawWorkbooks]
    )

    const allWorkbooks = useMemo<WorkbookListItem[]>(
        () =>
            (rawItems ?? []).map(item => {
                const shares = sharesByItem.get(item.id) ?? []
                const hasOtherShares = shares.some(s => s.user_org !== userOrgId)
                const ownerName = userOrgNames.get(item.created_by) ?? ''
                const wb = workbookByDriveItem.get(item.id)

                return {
                    id: item.id,
                    workbookId: wb?.id ?? '',
                    name: item.name,
                    description: item.description,
                    owner: item.created_by === userOrgId ? 'me' : ownerName,
                    ownerUserOrgId: item.created_by,
                    updated: item.updated,
                    shared: hasOtherShares,
                }
            }),
        [rawItems, sharesByItem, userOrgId, userOrgNames, workbookByDriveItem]
    )

    const workbooks = useMemo(() => {
        switch (activeSection) {
            case 'my-sheets':
                return allWorkbooks.filter(w => w.ownerUserOrgId === userOrgId)
            case 'shared-with-me':
                return allWorkbooks.filter(w => w.ownerUserOrgId !== userOrgId)
            case 'recent':
                return [...allWorkbooks]
                    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
                    .slice(0, 20)
            default:
                return allWorkbooks
        }
    }, [activeSection, allWorkbooks, userOrgId])

    const isLoading = !rawItems || !rawShares || !orgUserOrgs

    const createWorkbook = useMutation({
        mutationFn: function* ({ name, description }: { name: string; description?: string }) {
            const driveItemId = newRecordId()
            // Ensure unique name in root folder
            const existingNames = new Set(
                (rawItems ?? []).filter(i => i.parent === '').map(i => i.name)
            )
            let uniqueName = name
            let counter = 1
            while (existingNames.has(uniqueName)) {
                counter++
                uniqueName = `${name} ${counter}`
            }
            // Create the drive item
            yield driveItemsCollection.insert({
                id: driveItemId,
                org: orgId,
                name: uniqueName,
                is_folder: false,
                mime_type: SHEETS_MIME_TYPE,
                parent: '',
                created_by: userOrgId,
                size: 0,
                file: '',
                description: description ?? '',
            })
            // Create owner share
            yield driveSharesCollection.insert({
                id: newRecordId(),
                item: driveItemId,
                user_org: userOrgId,
                role: 'owner',
                created_by: userOrgId,
            })
            // Create the workbook link
            yield workbooksCollection.insert({
                id: newRecordId(),
                drive_item: driveItemId,
            })
        },
    })

    const deleteWorkbook = useMutation({
        mutationFn: function* (driveItemId: string) {
            yield driveItemsCollection.delete(driveItemId)
        },
    })

    const navigateToSection = useCallback((section: SidebarSection) => {
        setActiveSection(section)
    }, [])

    return useMemo(
        () => ({
            workbooks,
            isLoading,
            activeSection,
            navigateToSection,
            createWorkbook,
            deleteWorkbook,
        }),
        [workbooks, isLoading, activeSection, navigateToSection, createWorkbook, deleteWorkbook]
    )
}
