import { useState } from 'react'
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from 'tamagui'
import { useSpreadsheet } from '../hooks/useSpreadsheet'
import { rowColToCellRef } from '../lib/cell-utils'

const webInputStyle =
    Platform.OS === 'web' ? ({ outlineStyle: 'none' } as Record<string, unknown>) : {}

export function FormulaBar() {
    const theme = useTheme()
    const { selection, getCellValue, setCellValue, isReadOnly } = useSpreadsheet()
    const cell = getCellValue(selection.row, selection.col)
    const cellRef = rowColToCellRef(selection.row, selection.col)
    const [isFocused, setIsFocused] = useState(false)
    const [editText, setEditText] = useState('')

    const displayValue = cell?.value ?? ''

    const handleFocus = () => {
        setIsFocused(true)
        setEditText(displayValue)
    }

    const handleSubmit = () => {
        if (!isReadOnly) {
            setCellValue(selection.row, selection.col, editText)
        }
        setIsFocused(false)
    }

    return (
        <View style={[styles.container, { borderBottomColor: theme.borderColor.val }]}>
            <View
                style={[
                    styles.cellRef,
                    {
                        borderRightColor: theme.borderColor.val,
                        backgroundColor: theme.background.val,
                    },
                ]}
            >
                <Text style={[styles.cellRefText, { color: theme.color.val }]}>{cellRef}</Text>
            </View>
            <Text style={[styles.fx, { color: theme.color8.val }]}>fx</Text>
            <TextInput
                style={[styles.input, { color: theme.color.val }, webInputStyle]}
                value={isFocused ? editText : displayValue}
                onChangeText={setEditText}
                onFocus={handleFocus}
                onBlur={handleSubmit}
                onSubmitEditing={handleSubmit}
                editable={!isReadOnly}
                placeholder={isReadOnly ? 'View only' : ''}
                placeholderTextColor={theme.color8.val}
            />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        height: 32,
    },
    cellRef: {
        width: 60,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
    },
    cellRefText: {
        fontSize: 12,
        fontWeight: '600',
    },
    fx: {
        fontSize: 13,
        fontStyle: 'italic',
        fontWeight: '600',
        paddingHorizontal: 8,
    },
    input: {
        flex: 1,
        fontSize: 13,
        paddingHorizontal: 4,
        height: '100%',
    },
})
