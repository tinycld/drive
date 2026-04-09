import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useTheme } from 'tamagui'

export function SidebarNav({ children }: { children: ReactNode }) {
    const theme = useTheme()
    return (
        <View style={[styles.container, { backgroundColor: theme.sidebarBackground.val }]}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {children}
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    content: {
        padding: 8,
        gap: 2,
    },
})
