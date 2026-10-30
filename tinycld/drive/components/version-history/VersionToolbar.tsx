import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { CompareMode } from '../../lib/compare-mode'

interface VersionToolbarProps {
    title: string
    onBack: () => void
    onRename: () => void
    onRestore: () => void
    isActionsVisible: boolean
    isRestoring: boolean
    isCompareVisible: boolean
    compareMode: CompareMode
    onCompareModeChange: (mode: CompareMode) => void
}

export function VersionToolbar({
    title,
    onBack,
    onRename,
    onRestore,
    isActionsVisible,
    isRestoring,
    isCompareVisible,
    compareMode,
    onCompareModeChange,
}: VersionToolbarProps) {
    const fg = useThemeColor('foreground')
    return (
        <View className="border-b border-border bg-background">
            <View className="flex-row items-center gap-2 px-3 py-2">
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                    onPress={onBack}
                    hitSlop={8}
                    className="p-1"
                >
                    <ArrowLeft size={20} color={fg} />
                </Pressable>
                <Text
                    accessibilityRole="header"
                    className="flex-1 text-base font-medium text-foreground"
                    numberOfLines={1}
                >
                    {title}
                </Text>
                <VersionActions
                    isVisible={isActionsVisible}
                    onRename={onRename}
                    onRestore={onRestore}
                    isRestoring={isRestoring}
                />
            </View>
            <CompareChoice
                isVisible={isCompareVisible}
                mode={compareMode}
                onChange={onCompareModeChange}
            />
        </View>
    )
}

function VersionActions({
    isVisible,
    onRename,
    onRestore,
    isRestoring,
}: {
    isVisible: boolean
    onRename: () => void
    onRestore: () => void
    isRestoring: boolean
}) {
    if (!isVisible) return null
    return (
        <View className="flex-row gap-2">
            <Button variant="outline" size="sm" onPress={onRename}>
                <ButtonText>Rename</ButtonText>
            </Button>
            <Button size="sm" onPress={onRestore} isDisabled={isRestoring}>
                <ButtonText>Restore</ButtonText>
            </Button>
        </View>
    )
}

const COMPARE_OPTIONS: { mode: CompareMode; label: string; accessibilityLabel: string }[] = [
    { mode: 'none', label: 'Version', accessibilityLabel: 'Show this version' },
    {
        mode: 'previous',
        label: 'vs. previous',
        accessibilityLabel: 'Compare with previous version',
    },
    { mode: 'current', label: 'vs. current', accessibilityLabel: 'Compare with current document' },
]

function CompareChoice({
    isVisible,
    mode,
    onChange,
}: {
    isVisible: boolean
    mode: CompareMode
    onChange: (mode: CompareMode) => void
}) {
    if (!isVisible) return null
    const options = COMPARE_OPTIONS.map(option => (
        <CompareOption
            key={option.mode}
            label={option.label}
            accessibilityLabel={option.accessibilityLabel}
            isSelected={option.mode === mode}
            onPress={() => onChange(option.mode)}
        />
    ))
    return (
        <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Show changes"
            className="flex-row gap-1.5 px-3 pb-2"
        >
            {options}
        </View>
    )
}

function CompareOption({
    label,
    accessibilityLabel,
    isSelected,
    onPress,
}: {
    label: string
    accessibilityLabel: string
    isSelected: boolean
    onPress: () => void
}) {
    const boxClass = isSelected ? 'border-primary bg-primary' : 'border-border bg-background'
    const textClass = isSelected ? 'text-primary-foreground' : 'text-foreground'
    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ checked: isSelected }}
            onPress={onPress}
            className={`rounded-md border px-3 py-1 ${boxClass}`}
        >
            <Text className={`text-sm font-medium ${textClass}`}>{label}</Text>
        </Pressable>
    )
}
