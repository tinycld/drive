import { type GestureResponderEvent, Pressable, Text, View } from 'react-native'
import type { VersionRow } from '../../hooks/useVersionHistory'
import { VersionPeople } from './VersionPeople'
import { versionPeople, versionRowText } from './version-row-text'

interface VersionListRowProps {
    version: VersionRow
    isSelected: boolean
    isBase: boolean
    onSelect: (versionId: string) => void
    onPickBase: (versionId: string) => void
}

// ⌘-click (Ctrl-click off Mac) on web. Native has no modifier keys; there a
// long-press picks the base.
function hasCompareModifier(event: GestureResponderEvent) {
    const native = event.nativeEvent as { metaKey?: boolean; ctrlKey?: boolean }
    return !!(native.metaKey || native.ctrlKey)
}

export function VersionListRow({
    version,
    isSelected,
    isBase,
    onSelect,
    onPickBase,
}: VersionListRowProps) {
    const { title, time, badge } = versionRowText(version)
    const people = versionPeople(version)
    const rowClass = isSelected ? 'bg-accent' : 'bg-background'
    const baseClass = isBase ? 'border-l-4 border-l-primary' : ''
    const subtitle = version.label ? time : ''
    const press = (event: GestureResponderEvent) =>
        hasCompareModifier(event) ? onPickBase(version.id) : onSelect(version.id)

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityState={{ selected: isSelected }}
            accessibilityHint="⌘-click or long-press to compare with this version"
            onPress={press}
            onLongPress={() => onPickBase(version.id)}
            className={`px-4 py-3 border-b border-border ${rowClass} ${baseClass}`}
        >
            <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
                    {title}
                </Text>
                <BaseBadge isVisible={isBase} />
                <Text className="text-xs text-muted-foreground">{badge}</Text>
            </View>
            <SubtitleLine text={subtitle} />
            <VersionPeople userIds={people.userIds} shareNames={people.shareNames} />
        </Pressable>
    )
}

function SubtitleLine({ text }: { text: string }) {
    if (!text) return null
    return <Text className="text-xs text-muted-foreground">{text}</Text>
}

function BaseBadge({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="text-xs font-medium text-primary">Compared</Text>
}
