import { StyleSheet, View } from 'react-native'
import { getCalendarColorResolved } from './calendar-colors'

interface CalendarColorDotProps {
    colorKey: string
    size?: number
}

export function CalendarColorDot({ colorKey, size = 10 }: CalendarColorDotProps) {
    const { bg } = getCalendarColorResolved(colorKey)
    return (
        <View
            style={[
                styles.dot,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: bg,
                },
            ]}
        />
    )
}

const styles = StyleSheet.create({
    dot: {},
})
