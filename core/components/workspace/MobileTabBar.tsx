import { Settings } from 'lucide-react-native'
import { useRouter } from 'one'
import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from 'tamagui'
import { useAddons } from '~/lib/addons/use-addons'
import { useOrgHref } from '~/lib/org-routes'
import { useOrgSlug } from '~/lib/use-org-slug'
import { getIcon } from './addon-icon-map'
import { useWorkspaceLayout } from './useWorkspaceLayout'

export function MobileTabBar() {
    const theme = useTheme()
    const addons = useAddons()
    const { activeAddonSlug } = useWorkspaceLayout()
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const orgSlug = useOrgSlug()
    const orgHref = useOrgHref()

    const sorted = useMemo(
        () => [...addons].sort((a, b) => (a.nav.order ?? 99) - (b.nav.order ?? 99)),
        [addons]
    )

    return (
        <View
            style={[
                styles.tabBar,
                {
                    backgroundColor: theme.railBackground.val,
                    borderTopColor: theme.borderColor.val,
                    paddingBottom: insets.bottom,
                },
            ]}
        >
            {sorted.map(addon => {
                const Icon = getIcon(addon.nav.icon)
                const isActive = activeAddonSlug === addon.slug
                const color = isActive ? theme.railActiveText.val : theme.railText.val
                return (
                    <Pressable
                        key={addon.slug}
                        style={styles.tabItem}
                        onPress={() => router.push(`/a/${orgSlug}/${addon.slug}`)}
                        accessibilityLabel={addon.nav.label}
                    >
                        {isActive ? (
                            <View
                                style={[
                                    styles.activeIndicator,
                                    { backgroundColor: theme.activeIndicator.val },
                                ]}
                            />
                        ) : null}
                        <Icon size={22} color={color} />
                        <Text style={[styles.tabLabel, { color }]}>{addon.nav.label}</Text>
                    </Pressable>
                )
            })}
            <Pressable
                style={styles.tabItem}
                onPress={() => router.push(orgHref('settings'))}
                accessibilityLabel="Settings"
            >
                <Settings size={22} color={theme.railText.val} />
                <Text style={[styles.tabLabel, { color: theme.railText.val }]}>Settings</Text>
            </Pressable>
        </View>
    )
}

const styles = StyleSheet.create({
    tabBar: {
        flexDirection: 'row',
        height: 56,
        borderTopWidth: 1,
        alignItems: 'center',
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        position: 'relative',
    },
    tabLabel: {
        fontSize: 10,
        fontWeight: '500',
    },
    activeIndicator: {
        position: 'absolute',
        top: -4,
        width: 24,
        height: 3,
        borderRadius: 1.5,
    },
})
