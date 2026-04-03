import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { Star, Users } from 'lucide-react-native'
import { usePathname, useRouter } from 'one'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import { SidebarDivider, SidebarItem, SidebarNav } from '~/components/sidebar-primitives'
import { useStore } from '~/lib/pocketbase'

interface ContactsSidebarProps {
    orgSlug: string
    basePath: string
    isCollapsed: boolean
}

export default function ContactsSidebar({ orgSlug, basePath }: ContactsSidebarProps) {
    const router = useRouter()
    const pathname = usePathname()
    const theme = useTheme()
    const [contactsCollection] = useStore('contacts')

    const { data: allContacts } = useLiveQuery(query =>
        query.from({ contacts: contactsCollection })
    )

    const { data: favoriteContacts } = useLiveQuery(query =>
        query
            .from({ contacts: contactsCollection })
            .where(({ contacts }) => eq(contacts.favorite, true))
    )

    const totalCount = allContacts?.length ?? 0
    const favoriteCount = favoriteContacts?.length ?? 0

    const contactsRoute = {
        pathname: '/app/[orgSlug]/contacts',
        params: { orgSlug },
    } as const

    return (
        <SidebarNav>
            <View style={styles.createButtonWrapper}>
                <Pressable
                    style={[styles.createButton, { backgroundColor: theme.accentBackground.val }]}
                    onPress={() =>
                        router.push({
                            pathname: '/app/[orgSlug]/contacts/new',
                            params: { orgSlug },
                        })
                    }
                >
                    <Text style={styles.createButtonText}>+ Create contact</Text>
                </Pressable>
            </View>
            <SidebarItem
                label="Contacts"
                icon={Users}
                badge={totalCount}
                isActive={pathname === basePath || pathname === `${basePath}/`}
                onPress={() => router.push(contactsRoute)}
            />
            <SidebarItem
                label="Favorites"
                icon={Star}
                badge={favoriteCount}
                isActive={pathname === `${basePath}?filter=favorites`}
                onPress={() =>
                    router.push({
                        pathname: '/app/[orgSlug]/contacts',
                        params: { orgSlug, filter: 'favorites' },
                    })
                }
            />
            <SidebarDivider />
        </SidebarNav>
    )
}

const styles = StyleSheet.create({
    createButtonWrapper: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    createButton: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        alignItems: 'center',
    },
    createButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
})
