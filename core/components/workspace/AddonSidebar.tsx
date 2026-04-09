import { Suspense } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTheme } from 'tamagui'
import { useAddon } from '~/lib/addons/use-addons'
import { addonSidebars } from '~/lib/generated/addon-sidebars'
import { AddonSidebarFallback } from './AddonSidebarFallback'
import { useWorkspaceLayout } from './useWorkspaceLayout'

interface AddonSidebarProps {
    width: number
}

export function AddonSidebar({ width }: AddonSidebarProps) {
    const theme = useTheme()
    const { activeAddonSlug, isSidebarOpen } = useWorkspaceLayout()
    const addon = useAddon(activeAddonSlug ?? '')

    if (!isSidebarOpen || !addon) return null

    const SidebarComponent = addonSidebars[addon.slug]

    return (
        <View
            style={[
                styles.sidebar,
                {
                    width,
                    backgroundColor: theme.sidebarBackground.val,
                    borderRightColor: theme.borderColor.val,
                },
            ]}
        >
            {SidebarComponent ? (
                <Suspense fallback={null}>
                    <SidebarComponent isCollapsed={false} />
                </Suspense>
            ) : (
                <AddonSidebarFallback addonSlug={addon.slug} addonLabel={addon.nav.label} />
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    sidebar: {
        borderRightWidth: 1,
    },
})
