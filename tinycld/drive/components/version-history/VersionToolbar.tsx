import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Switch } from '@tinycld/core/ui/switch'
import { ArrowLeft } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'

interface VersionToolbarProps {
    title: string
    onBack: () => void
    onRename: () => void
    onRestore: () => void
    isActionsVisible: boolean
    isRestoring: boolean
    isComparing: boolean
    onToggleCompare: () => void
}

export function VersionToolbar({
    title,
    onBack,
    onRename,
    onRestore,
    isActionsVisible,
    isRestoring,
    isComparing,
    onToggleCompare,
}: VersionToolbarProps) {
    const fg = useThemeColor('foreground')
    return (
        <View className="flex-row items-center gap-2 border-b border-border bg-background px-3 py-2">
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
            <CompareSwitch
                isVisible={isActionsVisible}
                isComparing={isComparing}
                onToggle={onToggleCompare}
            />
            <VersionActions
                isVisible={isActionsVisible}
                onRename={onRename}
                onRestore={onRestore}
                isRestoring={isRestoring}
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

function CompareSwitch({
    isVisible,
    isComparing,
    onToggle,
}: {
    isVisible: boolean
    isComparing: boolean
    onToggle: () => void
}) {
    if (!isVisible) return null
    return (
        <View className="flex-row items-center gap-2">
            <Text className="text-sm text-muted-foreground">Show changes</Text>
            <Switch
                value={isComparing}
                onValueChange={onToggle}
                accessibilityLabel="Show changes"
            />
        </View>
    )
}
