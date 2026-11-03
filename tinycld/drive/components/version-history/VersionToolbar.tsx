import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import type { CompareMode } from '../../lib/compare-mode'
import { VersionPeople } from './VersionPeople'

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
    baseTitle: string
    onClearBase: () => void
    changedBy: { userIds: string[]; shareNames: string[] }
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
    baseTitle,
    onClearBase,
    changedBy,
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
                mode={baseTitle ? undefined : compareMode}
                onChange={onCompareModeChange}
            />
            <BaseCompareLine title={baseTitle} onClear={onClearBase} />
            <ChangedByLine
                isVisible={isCompareVisible && (!!baseTitle || compareMode !== 'none')}
                people={changedBy}
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
    mode: CompareMode | undefined
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

// Shown while two picked versions are compared; the three choices above are
// then all off.
function BaseCompareLine({ title, onClear }: { title: string; onClear: () => void }) {
    if (!title) return null
    return (
        <View className="flex-row items-center gap-2 px-3 pb-2">
            <Text className="text-sm text-muted-foreground">{`Comparing with ${title}`}</Text>
            <Button
                variant="outline"
                size="sm"
                onPress={onClear}
                accessibilityLabel="Clear comparison"
            >
                <ButtonText>Clear</ButtonText>
            </Button>
        </View>
    )
}

const CHANGED_BY_NAMES = 5

// Who made the changes the compare marks: the editors recorded on the
// versions inside the compared range.
function ChangedByLine({
    isVisible,
    people,
}: {
    isVisible: boolean
    people: { userIds: string[]; shareNames: string[] }
}) {
    if (!isVisible || people.userIds.length + people.shareNames.length === 0) return null
    return (
        <View accessibilityLabel="Changed by" className="flex-row items-center gap-1 px-3 pb-2">
            <Text className="text-xs text-muted-foreground">Changed by</Text>
            <VersionPeople
                userIds={people.userIds}
                shareNames={people.shareNames}
                maxNames={CHANGED_BY_NAMES}
            />
        </View>
    )
}
