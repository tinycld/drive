import { ChevronDown, Clock, File, Inbox, Pencil, Send, Star, Tag } from 'lucide-react-native'
import type { OneRouter } from 'one'
import { usePathname, useRouter } from 'one'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import {
    SidebarDivider,
    SidebarHeading,
    SidebarItem,
    SidebarNav,
} from '~/components/sidebar-primitives'
import { folderCounts, mockLabels } from './components/mockData'
import { composeEvents } from './hooks/composeEvents'

interface MailSidebarProps {
    basePath: string
    isCollapsed: boolean
}

function useActiveFolder() {
    const pathname = usePathname()
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    const folder = params.get('folder')
    const label = params.get('label')

    if (pathname.includes('/mail/')) return null
    if (label) return `label:${label}`
    return folder ?? 'inbox'
}

export default function MailSidebar(_props: MailSidebarProps) {
    const router = useRouter()
    const theme = useTheme()
    const activeFolder = useActiveFolder()

    const navigateToFolder = (folder: string) => {
        if (folder === 'inbox') {
            router.push('/app/mail' as OneRouter.Href)
        } else {
            router.push(`/app/mail?folder=${folder}` as OneRouter.Href)
        }
    }

    const navigateToLabel = (labelId: string) => {
        router.push(`/app/mail?label=${labelId}` as OneRouter.Href)
    }

    const labelItems = mockLabels.map(label => (
        <SidebarItem
            key={label.id}
            label={label.name}
            icon={Tag}
            isActive={activeFolder === `label:${label.id}`}
            onPress={() => navigateToLabel(label.id)}
        />
    ))

    return (
        <SidebarNav>
            <View style={styles.composeWrapper}>
                <Pressable
                    style={[styles.composeButton, { backgroundColor: theme.accentBackground.val }]}
                    onPress={() => composeEvents.emit()}
                >
                    <Pencil size={16} color={theme.accentColor.val} />
                    <Text style={[styles.composeText, { color: theme.accentColor.val }]}>
                        Compose
                    </Text>
                </Pressable>
            </View>

            <SidebarItem
                label="Inbox"
                icon={Inbox}
                badge={folderCounts.inbox || undefined}
                isActive={activeFolder === 'inbox'}
                onPress={() => navigateToFolder('inbox')}
            />
            <SidebarItem
                label="Starred"
                icon={Star}
                isActive={activeFolder === 'starred'}
                onPress={() => navigateToFolder('starred')}
            />
            <SidebarItem
                label="Snoozed"
                icon={Clock}
                isActive={activeFolder === 'snoozed'}
                onPress={() => navigateToFolder('snoozed')}
            />
            <SidebarItem
                label="Sent"
                icon={Send}
                isActive={activeFolder === 'sent'}
                onPress={() => navigateToFolder('sent')}
            />
            <SidebarItem
                label="Drafts"
                icon={File}
                badge={folderCounts.drafts || undefined}
                isActive={activeFolder === 'drafts'}
                onPress={() => navigateToFolder('drafts')}
            />
            <SidebarItem label="Categories" icon={ChevronDown} isActive={false} />
            <SidebarItem label="More" icon={ChevronDown} isActive={false} />

            <SidebarDivider />

            <View style={styles.labelsHeader}>
                <SidebarHeading>Labels</SidebarHeading>
                <Pressable style={styles.addLabelButton}>
                    <Text style={[styles.addLabelText, { color: theme.color8.val }]}>+</Text>
                </Pressable>
            </View>

            {labelItems}
        </SidebarNav>
    )
}

const styles = StyleSheet.create({
    composeWrapper: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    composeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
    },
    composeText: {
        fontSize: 14,
        fontWeight: '600',
    },
    labelsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingRight: 12,
    },
    addLabelButton: {
        padding: 4,
    },
    addLabelText: {
        fontSize: 18,
        fontWeight: '600',
    },
})
