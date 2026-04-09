import { useEffect, useRef, useState } from 'react'
import { Platform, TextInput, View } from 'react-native'
import { useTheme } from 'tamagui'
import { useSpreadsheet } from '../hooks/useSpreadsheet'

interface CellEditorProps {
    row: number
    col: number
    width: number
    height: number
    left: number
    top: number
}

const webInputStyle =
    Platform.OS === 'web' ? ({ outlineStyle: 'none' } as Record<string, unknown>) : {}

export function CellEditor({ row, col, width, height, left, top }: CellEditorProps) {
    const theme = useTheme()
    const { getCellValue, setCellValue, stopEditing } = useSpreadsheet()
    const inputRef = useRef<TextInput>(null)

    const cell = getCellValue(row, col)
    const [text, setText] = useState(cell?.value ?? '')

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const handleSubmit = () => {
        setCellValue(row, col, text)
        stopEditing()
    }

    return (
        <View
            style={{
                position: 'absolute',
                left,
                top,
                width: Math.max(width, 120),
                height,
                borderWidth: 2,
                borderColor: theme.accentBackground.val,
                zIndex: 10,
                backgroundColor: theme.background.val,
            }}
        >
            <TextInput
                ref={inputRef}
                style={[
                    {
                        flex: 1,
                        fontSize: 13,
                        color: theme.color.val,
                        paddingHorizontal: 4,
                        paddingVertical: 0,
                    },
                    webInputStyle,
                ]}
                value={text}
                onChangeText={setText}
                onSubmitEditing={handleSubmit}
                onBlur={handleSubmit}
                autoFocus
            />
        </View>
    )
}
