import { ScrollView, Text, View } from 'react-native'
import type { VersionRow } from '../../hooks/useVersionHistory'
import { VersionListRow } from './VersionListRow'

type VersionGroupData = { dayKey: string; label: string; versions: VersionRow[] }

interface VersionListProps {
    isVisible: boolean
    groups: VersionGroupData[]
    selectedId: string | undefined
    onSelect: (versionId: string) => void
    className?: string
}

export function VersionList({
    isVisible,
    groups,
    selectedId,
    onSelect,
    className,
}: VersionListProps) {
    if (!isVisible) return null
    const groupViews = groups.map(group => (
        <VersionGroup
            key={group.dayKey}
            group={group}
            selectedId={selectedId}
            onSelect={onSelect}
        />
    ))
    return (
        <ScrollView
            accessibilityRole="list"
            accessibilityLabel="Versions"
            className={`bg-background ${className ?? ''}`}
        >
            <EmptyList isVisible={groups.length === 0} />
            {groupViews}
        </ScrollView>
    )
}

function VersionGroup({
    group,
    selectedId,
    onSelect,
}: {
    group: VersionGroupData
    selectedId: string | undefined
    onSelect: (versionId: string) => void
}) {
    const rows = group.versions.map(version => (
        <VersionListRow
            key={version.id}
            version={version}
            isSelected={version.id === selectedId}
            onSelect={onSelect}
        />
    ))
    return (
        <View>
            <Text className="px-4 pt-4 pb-1 text-xs font-semibold uppercase text-muted-foreground">
                {group.label}
            </Text>
            {rows}
        </View>
    )
}

function EmptyList({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="p-4 text-sm text-muted-foreground">No versions yet</Text>
}
