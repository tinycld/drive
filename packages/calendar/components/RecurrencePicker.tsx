import { useState } from 'react'
import { Pressable, StyleSheet, TextInput as RNTextInput } from 'react-native'
import { Button, Dialog, SizableText, useTheme, XStack, YStack } from 'tamagui'
import {
    buildRRule,
    describeRRule,
    getContextualPresets,
    getWeekdayPosition,
    parseRRule,
    type RRuleOptions,
} from '../lib/recurrence'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const FREQ_OPTIONS = [
    { label: 'day', value: 'DAILY' as const },
    { label: 'week', value: 'WEEKLY' as const },
    { label: 'month', value: 'MONTHLY' as const },
    { label: 'year', value: 'YEARLY' as const },
]

interface RecurrencePickerProps {
    value: string
    onChange: (rrule: string) => void
    eventStartDate: Date
}

export function RecurrencePicker({ value, onChange, eventStartDate }: RecurrencePickerProps) {
    const theme = useTheme()
    const [showCustom, setShowCustom] = useState(false)
    const [showPresets, setShowPresets] = useState(false)
    const presets = getContextualPresets(eventStartDate)

    const displayLabel = value ? describeRRule(value, eventStartDate) : 'Does not repeat'

    const isPresetValue = presets.some(p => p.value === value)

    const handlePresetSelect = (preset: string) => {
        setShowPresets(false)
        if (preset === '__custom__') {
            setShowCustom(true)
        } else {
            onChange(preset)
        }
    }

    return (
        <YStack gap="$1.5" marginBottom="$3">
            <SizableText size="$3" fontWeight="600" color="$color">
                Recurrence
            </SizableText>
            <Pressable
                onPress={() => setShowPresets(true)}
                style={[
                    styles.pickerButton,
                    {
                        borderColor: theme.borderColor.val,
                        backgroundColor: theme.background.val,
                    },
                ]}
            >
                <SizableText size="$3" color={value ? '$color' : '$color8'}>
                    {displayLabel}
                </SizableText>
            </Pressable>

            <PresetDialog
                open={showPresets}
                onOpenChange={setShowPresets}
                presets={presets}
                currentValue={value}
                onSelect={handlePresetSelect}
            />

            <CustomRecurrenceDialog
                open={showCustom}
                onOpenChange={setShowCustom}
                eventStartDate={eventStartDate}
                initialValue={isPresetValue ? undefined : value}
                onSave={onChange}
            />
        </YStack>
    )
}

function PresetDialog({
    open,
    onOpenChange,
    presets,
    currentValue,
    onSelect,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    presets: { label: string; value: string }[]
    currentValue: string
    onSelect: (value: string) => void
}) {
    const theme = useTheme()

    return (
        <Dialog modal open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay
                    key="overlay"
                    opacity={0.3}
                    backgroundColor="$shadow6"
                    enterStyle={{ opacity: 0 }}
                    exitStyle={{ opacity: 0 }}
                />
                <Dialog.Content
                    key="content"
                    bordered
                    elevate
                    padding="$3"
                    gap="$1"
                    width={320}
                    backgroundColor="$background"
                >
                    <Dialog.Title size="$5">Repeat</Dialog.Title>
                    <YStack gap="$1" paddingTop="$2">
                        {presets.map(preset => {
                            const isSelected = preset.value === currentValue
                            return (
                                <Pressable
                                    key={preset.value || 'none'}
                                    onPress={() => onSelect(preset.value)}
                                    style={[
                                        styles.presetRow,
                                        isSelected && {
                                            backgroundColor: `${theme.accentBackground?.val}20`,
                                        },
                                    ]}
                                >
                                    <SizableText
                                        size="$3"
                                        color={isSelected ? '$accentColor' : '$color'}
                                        fontWeight={isSelected ? '600' : '400'}
                                    >
                                        {preset.label}
                                    </SizableText>
                                </Pressable>
                            )
                        })}
                    </YStack>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    )
}

interface CustomState {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
    interval: number
    byDay: string[]
    endType: 'never' | 'on' | 'after'
    untilDate: string
    count: number
    monthlyMode: 'dayOfMonth' | 'dayOfWeek'
}

function initCustomState(eventStartDate: Date, initialValue?: string): CustomState {
    const defaults: CustomState = {
        freq: 'WEEKLY',
        interval: 1,
        byDay: [DAY_CODES[eventStartDate.getDay()]],
        endType: 'never',
        untilDate: '',
        count: 13,
        monthlyMode: 'dayOfMonth',
    }

    if (!initialValue) return defaults

    const parsed = parseRRule(initialValue)
    if (!parsed) return defaults

    const state: CustomState = {
        ...defaults,
        freq: parsed.freq,
        interval: parsed.interval || 1,
    }

    if (parsed.byDay && parsed.byDay.length > 0) {
        if (parsed.freq === 'MONTHLY') {
            state.monthlyMode = 'dayOfWeek'
        } else {
            state.byDay = parsed.byDay
        }
    }

    if (parsed.count) {
        state.endType = 'after'
        state.count = parsed.count
    } else if (parsed.until) {
        state.endType = 'on'
        const y = parsed.until.getFullYear()
        const m = String(parsed.until.getMonth() + 1).padStart(2, '0')
        const d = String(parsed.until.getDate()).padStart(2, '0')
        state.untilDate = `${y}-${m}-${d}`
    }

    return state
}

function CustomRecurrenceDialog({
    open,
    onOpenChange,
    eventStartDate,
    initialValue,
    onSave,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    eventStartDate: Date
    initialValue?: string
    onSave: (rrule: string) => void
}) {
    const theme = useTheme()
    const [state, setState] = useState<CustomState>(() =>
        initCustomState(eventStartDate, initialValue)
    )

    const updateState = (partial: Partial<CustomState>) => {
        setState(prev => ({ ...prev, ...partial }))
    }

    const handleDone = () => {
        const options: RRuleOptions = {
            freq: state.freq,
            interval: state.interval,
        }

        if (state.freq === 'WEEKLY' && state.byDay.length > 0) {
            options.byDay = state.byDay
        }

        if (state.freq === 'DAILY' && state.byDay.length > 0 && state.byDay.length < 7) {
            options.byDay = state.byDay
        }

        if (state.freq === 'MONTHLY') {
            if (state.monthlyMode === 'dayOfWeek') {
                const { position, day } = getWeekdayPosition(eventStartDate)
                options.byDay = [`${position}${day}`]
            } else {
                options.byMonthDay = [eventStartDate.getDate()]
            }
        }

        if (state.endType === 'after' && state.count > 0) {
            options.count = state.count
        } else if (state.endType === 'on' && state.untilDate) {
            options.until = new Date(`${state.untilDate}T23:59:59`)
        }

        onSave(buildRRule(options))
        onOpenChange(false)
    }

    return (
        <Dialog modal open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay
                    key="overlay"
                    opacity={0.3}
                    backgroundColor="$shadow6"
                    enterStyle={{ opacity: 0 }}
                    exitStyle={{ opacity: 0 }}
                />
                <Dialog.Content
                    key="content"
                    bordered
                    elevate
                    padding="$4"
                    gap="$4"
                    width={360}
                    backgroundColor="$background"
                >
                    <Dialog.Title size="$5">Custom recurrence</Dialog.Title>

                    <YStack gap="$3">
                        <XStack alignItems="center" gap="$2">
                            <SizableText size="$3" color="$color">
                                Repeat every
                            </SizableText>
                            <Pressable
                                onPress={() => {
                                    updateState({ interval: Math.min(state.interval + 1, 99) })
                                }}
                                onLongPress={() => {
                                    updateState({ interval: Math.max(state.interval - 1, 1) })
                                }}
                                style={[
                                    styles.numberBox,
                                    { borderColor: theme.borderColor.val },
                                ]}
                            >
                                <SizableText size="$3" color="$color" textAlign="center">
                                    {state.interval}
                                </SizableText>
                            </Pressable>
                            <XStack gap="$1" flexWrap="wrap" flex={1}>
                                {FREQ_OPTIONS.map(opt => {
                                    const isSelected = state.freq === opt.value
                                    return (
                                        <Button
                                            key={opt.value}
                                            size="$2"
                                            theme={isSelected ? 'accent' : undefined}
                                            borderColor={
                                                isSelected ? '$accentBackground' : '$borderColor'
                                            }
                                            borderWidth={1}
                                            onPress={() => updateState({ freq: opt.value })}
                                        >
                                            <Button.Text size="$2">
                                                {state.interval > 1
                                                    ? `${opt.label}s`
                                                    : opt.label}
                                            </Button.Text>
                                        </Button>
                                    )
                                })}
                            </XStack>
                        </XStack>

                        <WeekDaySelector
                            isVisible={state.freq === 'WEEKLY'}
                            selectedDays={state.byDay}
                            onToggle={day => {
                                const has = state.byDay.includes(day)
                                if (has) {
                                    if (state.byDay.length > 1) {
                                        updateState({
                                            byDay: state.byDay.filter(d => d !== day),
                                        })
                                    }
                                } else {
                                    updateState({ byDay: [...state.byDay, day] })
                                }
                            }}
                        />

                        <MonthlyModeSelector
                            isVisible={state.freq === 'MONTHLY'}
                            monthlyMode={state.monthlyMode}
                            eventStartDate={eventStartDate}
                            onChange={mode => updateState({ monthlyMode: mode })}
                        />

                        <YStack gap="$2">
                            <SizableText size="$3" fontWeight="600" color="$color">
                                Ends
                            </SizableText>
                            <XStack gap="$2" flexWrap="wrap">
                                {(['never', 'on', 'after'] as const).map(type => {
                                    const isSelected = state.endType === type
                                    const label =
                                        type === 'never'
                                            ? 'Never'
                                            : type === 'on'
                                              ? 'On date'
                                              : 'After'
                                    return (
                                        <Button
                                            key={type}
                                            size="$2"
                                            theme={isSelected ? 'accent' : undefined}
                                            borderColor={
                                                isSelected ? '$accentBackground' : '$borderColor'
                                            }
                                            borderWidth={1}
                                            onPress={() => updateState({ endType: type })}
                                        >
                                            <Button.Text size="$2">{label}</Button.Text>
                                        </Button>
                                    )
                                })}
                            </XStack>

                            <EndDateInput
                                isVisible={state.endType === 'on'}
                                value={state.untilDate}
                                onChange={val => updateState({ untilDate: val })}
                            />

                            <EndCountInput
                                isVisible={state.endType === 'after'}
                                value={state.count}
                                onIncrement={() =>
                                    updateState({ count: Math.min(state.count + 1, 999) })
                                }
                                onDecrement={() =>
                                    updateState({ count: Math.max(state.count - 1, 1) })
                                }
                            />
                        </YStack>
                    </YStack>

                    <XStack justifyContent="flex-end" gap="$2" paddingTop="$2">
                        <Button size="$3" onPress={() => onOpenChange(false)}>
                            <Button.Text>Cancel</Button.Text>
                        </Button>
                        <Button size="$3" theme="accent" onPress={handleDone}>
                            <Button.Text fontWeight="600">Done</Button.Text>
                        </Button>
                    </XStack>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    )
}

function WeekDaySelector({
    isVisible,
    selectedDays,
    onToggle,
}: {
    isVisible: boolean
    selectedDays: string[]
    onToggle: (day: string) => void
}) {
    const theme = useTheme()

    if (!isVisible) return null

    return (
        <YStack gap="$1.5">
            <SizableText size="$3" fontWeight="600" color="$color">
                Repeat on
            </SizableText>
            <XStack gap="$1.5" justifyContent="center">
                {DAY_CODES.map((code, i) => {
                    const isSelected = selectedDays.includes(code)
                    return (
                        <Pressable
                            key={code}
                            onPress={() => onToggle(code)}
                            style={[
                                styles.dayCircle,
                                {
                                    backgroundColor: isSelected
                                        ? theme.accentBackground.val
                                        : 'transparent',
                                    borderColor: isSelected
                                        ? theme.accentBackground.val
                                        : theme.borderColor.val,
                                },
                            ]}
                        >
                            <SizableText
                                size="$2"
                                color={isSelected ? 'white' : '$color'}
                                fontWeight={isSelected ? '600' : '400'}
                            >
                                {DAY_LABELS[i]}
                            </SizableText>
                        </Pressable>
                    )
                })}
            </XStack>
        </YStack>
    )
}

function MonthlyModeSelector({
    isVisible,
    monthlyMode,
    eventStartDate,
    onChange,
}: {
    isVisible: boolean
    monthlyMode: 'dayOfMonth' | 'dayOfWeek'
    eventStartDate: Date
    onChange: (mode: 'dayOfMonth' | 'dayOfWeek') => void
}) {
    if (!isVisible) return null

    const dayOfMonth = eventStartDate.getDate()
    const { position } = getWeekdayPosition(eventStartDate)
    const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
    ]
    const dayName = dayNames[eventStartDate.getDay()]
    const ordinals = ['', 'first', 'second', 'third', 'fourth', 'fifth']
    const ordinal = ordinals[position] ?? `${position}th`

    return (
        <YStack gap="$1.5">
            <SizableText size="$3" fontWeight="600" color="$color">
                Monthly on
            </SizableText>
            <XStack gap="$2">
                <Button
                    size="$2"
                    theme={monthlyMode === 'dayOfMonth' ? 'accent' : undefined}
                    borderColor={monthlyMode === 'dayOfMonth' ? '$accentBackground' : '$borderColor'}
                    borderWidth={1}
                    onPress={() => onChange('dayOfMonth')}
                >
                    <Button.Text size="$2">Day {dayOfMonth}</Button.Text>
                </Button>
                <Button
                    size="$2"
                    theme={monthlyMode === 'dayOfWeek' ? 'accent' : undefined}
                    borderColor={monthlyMode === 'dayOfWeek' ? '$accentBackground' : '$borderColor'}
                    borderWidth={1}
                    onPress={() => onChange('dayOfWeek')}
                >
                    <Button.Text size="$2">
                        {ordinal} {dayName}
                    </Button.Text>
                </Button>
            </XStack>
        </YStack>
    )
}

function EndDateInput({
    isVisible,
    value,
    onChange,
}: {
    isVisible: boolean
    value: string
    onChange: (val: string) => void
}) {
    const theme = useTheme()

    if (!isVisible) return null

    return (
        <XStack alignItems="center" gap="$2">
            <SizableText size="$3" color="$color">
                End date:
            </SizableText>
            <RNTextInput
                value={value}
                onChangeText={onChange}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.color8.val}
                style={{
                    borderWidth: 1,
                    borderColor: theme.borderColor.val,
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    color: theme.color.val,
                    fontSize: 14,
                    flex: 1,
                }}
            />
        </XStack>
    )
}

function EndCountInput({
    isVisible,
    value,
    onIncrement,
    onDecrement,
}: {
    isVisible: boolean
    value: number
    onIncrement: () => void
    onDecrement: () => void
}) {
    if (!isVisible) return null

    return (
        <XStack alignItems="center" gap="$2">
            <SizableText size="$3" color="$color">
                After
            </SizableText>
            <XStack alignItems="center" gap="$1">
                <Button size="$2" onPress={onDecrement}>
                    <Button.Text>-</Button.Text>
                </Button>
                <SizableText size="$3" color="$color" textAlign="center" width={40}>
                    {value}
                </SizableText>
                <Button size="$2" onPress={onIncrement}>
                    <Button.Text>+</Button.Text>
                </Button>
            </XStack>
            <SizableText size="$3" color="$color">
                occurrences
            </SizableText>
        </XStack>
    )
}

const styles = StyleSheet.create({
    pickerButton: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    presetRow: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 6,
    },
    numberBox: {
        borderWidth: 1,
        borderRadius: 6,
        width: 44,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
})
