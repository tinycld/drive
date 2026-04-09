import { ChevronDown, ChevronLeft, ChevronRight, Menu } from 'lucide-react-native'
import { Pressable } from 'react-native'
import { Button, SizableText, useTheme, XGroup, XStack } from 'tamagui'
import { useBreakpoint } from '~/components/workspace/useBreakpoint'
import { useWorkspaceLayout } from '~/components/workspace/useWorkspaceLayout'
import { formatDateLabel } from '../hooks/useCalendarNavigation'
import { useCalendarView, type ViewMode } from '../hooks/useCalendarView'

const DESKTOP_VIEW_MODES: ViewMode[] = ['day', 'week', 'month']
const VIEW_LABELS: Record<ViewMode, string> = {
    day: 'Day',
    week: 'Week',
    month: 'Month',
    schedule: 'Schedule',
}

export function CalendarHeader() {
    const { viewMode, setViewMode, focusDate, goToday, goNext, goPrevious } = useCalendarView()
    const theme = useTheme()
    const breakpoint = useBreakpoint()
    const isMobile = breakpoint === 'mobile'
    const { setDrawerOpen } = useWorkspaceLayout()

    const dateLabel = formatDateLabel(focusDate, viewMode)

    if (isMobile) {
        return (
            <XStack
                alignItems="center"
                paddingHorizontal="$3"
                paddingVertical="$2"
                gap="$2"
                borderBottomWidth={1}
                borderBottomColor="$borderColor"
            >
                <Pressable onPress={() => setDrawerOpen(true)} hitSlop={8}>
                    <Menu size={22} color={theme.color.val} />
                </Pressable>

                <Pressable
                    onPress={() => setViewMode('month')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                    hitSlop={4}
                >
                    <SizableText size="$5" fontWeight="600" color="$color">
                        {dateLabel}
                    </SizableText>
                    <ChevronDown size={16} color={theme.color8.val} />
                </Pressable>

                <XStack flex={1} />

                <Button size="$2" variant="outlined" borderColor="$borderColor" onPress={goToday}>
                    <Button.Text>Today</Button.Text>
                </Button>

                <Pressable onPress={goPrevious} hitSlop={8}>
                    <ChevronLeft size={20} color={theme.color.val} />
                </Pressable>
                <Pressable onPress={goNext} hitSlop={8}>
                    <ChevronRight size={20} color={theme.color.val} />
                </Pressable>
            </XStack>
        )
    }

    return (
        <XStack
            alignItems="center"
            paddingHorizontal="$4"
            paddingVertical="$2"
            gap="$2"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
        >
            <Button size="$3" variant="outlined" borderColor="$borderColor" onPress={goToday}>
                <Button.Text>Today</Button.Text>
            </Button>

            <Pressable onPress={goPrevious} hitSlop={8}>
                <ChevronLeft size={20} color={theme.color.val} />
            </Pressable>
            <Pressable onPress={goNext} hitSlop={8}>
                <ChevronRight size={20} color={theme.color.val} />
            </Pressable>

            <SizableText size="$6" fontWeight="600" color="$color" flex={1}>
                {dateLabel}
            </SizableText>

            <XGroup>
                {DESKTOP_VIEW_MODES.map(mode => (
                    <XGroup.Item key={mode}>
                        <Button
                            size="$3"
                            theme={viewMode === mode ? 'accent' : undefined}
                            variant={viewMode === mode ? undefined : 'outlined'}
                            borderColor={viewMode === mode ? undefined : '$borderColor'}
                            onPress={() => setViewMode(mode)}
                        >
                            <Button.Text>{VIEW_LABELS[mode]}</Button.Text>
                        </Button>
                    </XGroup.Item>
                ))}
            </XGroup>
        </XStack>
    )
}
