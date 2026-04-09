import { SizableText, View, YStack } from 'tamagui'
import { getShortDayName } from '../hooks/useCalendarNavigation'

interface DayColumnHeaderProps {
    date: Date
    isToday: boolean
}

export function DayColumnHeader({ date, isToday }: DayColumnHeaderProps) {
    const dayName = getShortDayName(date)
    const dateNum = date.getDate()

    return (
        <YStack alignItems="center" paddingVertical="$2" gap="$1">
            <SizableText
                size="$1"
                fontWeight="600"
                color={isToday ? '$accentBackground' : '$color8'}
            >
                {dayName}
            </SizableText>
            <View
                width={28}
                height={28}
                borderRadius={14}
                alignItems="center"
                justifyContent="center"
                backgroundColor={isToday ? '$accentBackground' : 'transparent'}
            >
                <SizableText size="$4" fontWeight="600" color={isToday ? '$accentColor' : '$color'}>
                    {dateNum}
                </SizableText>
            </View>
        </YStack>
    )
}
