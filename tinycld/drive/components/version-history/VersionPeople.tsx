import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { Text, View } from 'react-native'

const MAX_NAMES = 2

function PersonName({ userId, isLast }: { userId: string; isLast: boolean }) {
    const [usersCollection] = useStore('users')
    const { record: user } = useRecord(usersCollection, userId)
    const name = user?.name || user?.email || 'Someone'
    return <Text className="text-xs text-muted-foreground">{isLast ? name : `${name}, `}</Text>
}

interface VersionPeopleProps {
    userIds: string[]
    shareNames: string[]
    maxNames?: number
}

// Names are read per user in this row (useRecord), not joined into the list
// query: the row only displays them.
export function VersionPeople({ userIds, shareNames, maxNames = MAX_NAMES }: VersionPeopleProps) {
    const names = [
        ...userIds.map(id => ({ kind: 'user' as const, id })),
        ...shareNames.map(id => ({ kind: 'share' as const, id })),
    ]
    const shown = names.slice(0, maxNames)
    if (shown.length === 0) return null
    const entries = shown.map((entry, index) => (
        <PersonEntry key={entry.id} entry={entry} isLast={index === shown.length - 1} />
    ))
    return (
        <View className="flex-row flex-wrap">
            {entries}
            <ExtraCount count={names.length - shown.length} />
        </View>
    )
}

function PersonEntry({
    entry,
    isLast,
}: {
    entry: { kind: 'user' | 'share'; id: string }
    isLast: boolean
}) {
    if (entry.kind === 'user') return <PersonName userId={entry.id} isLast={isLast} />
    return (
        <Text className="text-xs text-muted-foreground">{isLast ? entry.id : `${entry.id}, `}</Text>
    )
}

function ExtraCount({ count }: { count: number }) {
    if (count <= 0) return null
    return <Text className="text-xs text-muted-foreground">{` +${count}`}</Text>
}
