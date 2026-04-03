import { Slot } from 'one'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from 'tamagui'
import { AddonRail } from './AddonRail'
import { AddonSidebar } from './AddonSidebar'
import { useWorkspaceLayout } from './useWorkspaceLayout'

const SIDEBAR_WIDTH = 260

interface WorkspaceLayoutProps {
    orgSlug: string
}

export function WorkspaceLayout({ orgSlug }: WorkspaceLayoutProps) {
    const theme = useTheme()
    const { breakpoint, isSidebarOpen, setSidebarOpen } = useWorkspaceLayout()

    const isTablet = breakpoint === 'tablet'
    const showSidebarOverlay = isTablet && isSidebarOpen

    return (
        <View style={[styles.container, { backgroundColor: theme.background.val }]}>
            <AddonRail orgSlug={orgSlug} />

            {isTablet ? (
                <SidebarOverlay
                    isVisible={showSidebarOverlay}
                    orgSlug={orgSlug}
                    overlayColor={theme.overlayBackground.val}
                    onDismiss={() => setSidebarOpen(false)}
                />
            ) : (
                <AddonSidebar orgSlug={orgSlug} width={SIDEBAR_WIDTH} />
            )}

            <View style={[styles.main, { backgroundColor: theme.background.val }]}>
                <Slot />
            </View>
        </View>
    )
}

function SidebarOverlay({
    isVisible,
    orgSlug,
    overlayColor,
    onDismiss,
}: {
    isVisible: boolean
    orgSlug: string
    overlayColor: string
    onDismiss: () => void
}) {
    if (!isVisible) return null

    return (
        <View style={styles.overlay}>
            <Pressable
                style={[styles.overlayBackdrop, { backgroundColor: overlayColor }]}
                onPress={onDismiss}
            />
            <View style={styles.overlayPanel}>
                <AddonSidebar orgSlug={orgSlug} width={SIDEBAR_WIDTH} />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
        ...(Platform.OS === 'web' ? { height: '100vh' as unknown as number } : {}),
    },
    main: {
        flex: 1,
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        flexDirection: 'row',
    },
    overlayBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    overlayPanel: {
        marginLeft: 64,
        zIndex: 101,
    },
})
