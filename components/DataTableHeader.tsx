import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'

interface Column {
    label: string
    flex: number
}

interface DataTableHeaderProps {
    columns: Column[]
    trailing?: ReactNode
}

export function DataTableHeader({ columns, trailing }: DataTableHeaderProps) {
    const theme = useTheme()

    return (
        <View style={[styles.container, { borderBottomColor: theme.borderColor.val }]}>
            {columns.map(col => (
                <Text
                    key={col.label}
                    style={[styles.label, { color: theme.color8.val, flex: col.flex }]}
                >
                    {col.label}
                </Text>
            ))}
            {trailing}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
})
