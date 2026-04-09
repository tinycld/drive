import { StyleSheet, View } from 'react-native'
import { useTheme } from 'tamagui'

export function SidebarDivider() {
    const theme = useTheme()
    return <View style={[styles.divider, { backgroundColor: theme.borderColor.val }]} />
}

const styles = StyleSheet.create({
    divider: {
        height: 1,
        marginHorizontal: 12,
        marginVertical: 8,
    },
})
