import { Suspense } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTheme } from 'tamagui'
import { useAddon } from '~/lib/addons/use-addons'
import { addonSidebars } from '~/lib/generated/addon-sidebars'
import { AddonSidebarFallback } from './AddonSidebarFallback'
import { useWorkspaceLayout } from './useWorkspaceLayout'

interface AddonSidebarProps {
    orgSlug: string
    width: number
}

export function AddonSidebar({ orgSlug, width }: AddonSidebarProps) {
    const theme = useTheme()
    const { activeAddonSlug, isSidebarOpen } = useWorkspaceLayout()
    const addon = useAddon(activeAddonSlug ?? '')

    if (!isSidebarOpen || !addon) return null

    const basePath = `/app/${orgSlug}/${addon.slug}`
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
                    <SidebarComponent orgSlug={orgSlug} basePath={basePath} isCollapsed={false} />
                </Suspense>
            ) : (
                <AddonSidebarFallback addonLabel={addon.nav.label} basePath={basePath} />
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    sidebar: {
        borderRightWidth: 1,
    },
})
