import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import { useSpreadsheet } from '../hooks/useSpreadsheet'
import { ROW_HEADER_WIDTH } from '../lib/cell-utils'

interface RowHeaderProps {
    row: number
    height: number
}

export const RowHeader = memo(function RowHeader({ row, height }: RowHeaderProps) {
    const theme = useTheme()
    const { selection } = useSpreadsheet()
    const isSelected = selection.row === row

    return (
        <View
            style={[
                styles.cell,
                {
                    width: ROW_HEADER_WIDTH,
                    height,
                    borderRightColor: theme.borderColor.val,
                    borderBottomColor: theme.borderColor.val,
                    backgroundColor: isSelected
                        ? `${theme.accentBackground.val}20`
                        : theme.background.val,
                },
            ]}
        >
            <Text style={[styles.text, { color: theme.color8.val }]}>{row + 1}</Text>
        </View>
    )
})

const styles = StyleSheet.create({
    cell: {
        borderRightWidth: 1,
        borderBottomWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontSize: 12,
        fontWeight: '600',
    },
})
