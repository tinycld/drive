import { StyleSheet, Text } from 'react-native'
import { useTheme } from 'tamagui'

export function SidebarHeading({ children }: { children: string }) {
    const theme = useTheme()
    return (
        <Text style={[styles.heading, { color: theme.color8.val }]}>
            {children}
        </Text>
    )
}

const styles = StyleSheet.create({
    heading: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        paddingHorizontal: 12,
        paddingTop: 16,
        paddingBottom: 4,
    },
})
