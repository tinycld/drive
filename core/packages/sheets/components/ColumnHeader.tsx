import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import { useSpreadsheet } from '../hooks/useSpreadsheet'
import { colIndexToLetter, HEADER_HEIGHT, ROW_HEADER_WIDTH } from '../lib/cell-utils'

export const ColumnHeader = memo(function ColumnHeader() {
    const theme = useTheme()
    const { gridDimensions, getColWidth, selection } = useSpreadsheet()

    const headers: { col: number; letter: string; width: number; left: number }[] = []
    let x = 0
    for (let c = 0; c < gridDimensions.cols; c++) {
        const w = getColWidth(c)
        headers.push({ col: c, letter: colIndexToLetter(c), width: w, left: x })
        x += w
    }

    return (
        <View style={[styles.row, { backgroundColor: theme.background.val }]}>
            <View
                style={[
                    styles.cornerCell,
                    {
                        width: ROW_HEADER_WIDTH,
                        height: HEADER_HEIGHT,
                        borderRightColor: theme.borderColor.val,
                        borderBottomColor: theme.borderColor.val,
                    },
                ]}
            />
            {headers.map(h => (
                <View
                    key={h.col}
                    style={[
                        styles.headerCell,
                        {
                            width: h.width,
                            height: HEADER_HEIGHT,
                            borderRightColor: theme.borderColor.val,
                            borderBottomColor: theme.borderColor.val,
                        },
                        selection.col === h.col && {
                            backgroundColor: `${theme.accentBackground.val}20`,
                        },
                    ]}
                >
                    <Text style={[styles.headerText, { color: theme.color8.val }]}>{h.letter}</Text>
                </View>
            ))}
        </View>
    )
})

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
    },
    cornerCell: {
        borderRightWidth: 1,
        borderBottomWidth: 1,
    },
    headerCell: {
        borderRightWidth: 1,
        borderBottomWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerText: {
        fontSize: 12,
        fontWeight: '600',
    },
})
