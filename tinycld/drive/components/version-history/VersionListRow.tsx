import { Pressable, Text, View } from 'react-native'
import type { VersionRow } from '../../hooks/useVersionHistory'
import { VersionPeople } from './VersionPeople'
import { versionPeople, versionRowText } from './version-row-text'

interface VersionListRowProps {
    version: VersionRow
    isSelected: boolean
    onSelect: (versionId: string) => void
}

export function VersionListRow({ version, isSelected, onSelect }: VersionListRowProps) {
    const { title, time, badge } = versionRowText(version)
    const people = versionPeople(version)
    const rowClass = isSelected ? 'bg-accent' : 'bg-background'
    const subtitle = version.label ? time : ''

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(version.id)}
            className={`px-4 py-3 border-b border-border ${rowClass}`}
        >
            <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
                    {title}
                </Text>
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
