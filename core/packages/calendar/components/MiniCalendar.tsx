import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import { addMonths, isSameDay } from '../hooks/useCalendarNavigation'
import { getMonthGrid } from '../hooks/useMonthGrid'

const DAY_LETTERS = [
    { key: 'sun', label: 'S' },
    { key: 'mon', label: 'M' },
    { key: 'tue', label: 'T' },
    { key: 'wed', label: 'W' },
    { key: 'thu', label: 'T' },
    { key: 'fri', label: 'F' },
    { key: 'sat', label: 'S' },
]

interface MiniCalendarProps {
    selectedDate: Date
    onDateSelect: (date: Date) => void
}

export function MiniCalendar({ selectedDate, onDateSelect }: MiniCalendarProps) {
    const [displayMonth, setDisplayMonth] = useState(
        () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    )
    const theme = useTheme()

    const grid = getMonthGrid(displayMonth)

    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ]

    const monthLabel = `${months[displayMonth.getMonth()]} ${displayMonth.getFullYear()}`

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={[styles.monthLabel, { color: theme.color.val }]}>{monthLabel}</Text>
                <View style={styles.navButtons}>
                    <Pressable
                        onPress={() => setDisplayMonth(prev => addMonths(prev, -1))}
                        hitSlop={8}
                    >
                        <ChevronLeft size={16} color={theme.color8.val} />
                    </Pressable>
                    <Pressable
                        onPress={() => setDisplayMonth(prev => addMonths(prev, 1))}
                        hitSlop={8}
                    >
                        <ChevronRight size={16} color={theme.color8.val} />
                    </Pressable>
                </View>
            </View>

            <View style={styles.dayHeaders}>
                {DAY_LETTERS.map(day => (
                    <View key={day.key} style={styles.dayCell}>
                        <Text style={[styles.dayHeaderText, { color: theme.color8.val }]}>
                            {day.label}
                        </Text>
                    </View>
                ))}
            </View>

            <View style={styles.grid}>
                {grid.map(cell => {
                    const isSelected = isSameDay(cell.date, selectedDate)
                    const cellKey = cell.date.toISOString().split('T')[0]

                    return (
                        <Pressable
                            key={cellKey}
                            style={styles.dayCell}
                            onPress={() => onDateSelect(cell.date)}
                        >
                            <View
                                style={[
                                    styles.dayCellInner,
                                    cell.isToday && {
                                        backgroundColor: theme.accentBackground.val,
                                    },
                                    isSelected &&
                                        !cell.isToday && {
                                            // Hex alpha suffix for ~19% opacity
                                            backgroundColor: `${theme.activeIndicator.val}30`,
                                        },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.dateText,
                                        {
                                            color: cell.isToday
                                                ? theme.accentColor.val
                                                : cell.isCurrentMonth
                                                  ? theme.color.val
                                                  : theme.color8.val,
                                        },
                                        cell.isToday && styles.todayText,
                                    ]}
                                >
                                    {cell.date.getDate()}
                                </Text>
                            </View>
                        </Pressable>
                    )
                })}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    monthLabel: {
        fontSize: 13,
        fontWeight: '600',
    },
    navButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    dayHeaders: {
        flexDirection: 'row',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        alignItems: 'center',
        paddingVertical: 1,
    },
    dayCellInner: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayHeaderText: {
        fontSize: 10,
        fontWeight: '600',
    },
    dateText: {
        fontSize: 11,
    },
    todayText: {
        fontWeight: '700',
    },
})
