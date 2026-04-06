import type { OneRouter } from 'one'
import { Link } from 'one'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'

interface EmptyStateActionPress {
    label: string
    onPress: () => void
}

interface EmptyStateActionHref {
    label: string
    href: OneRouter.Href
}

interface EmptyStateProps {
    message: string
    action?: EmptyStateActionPress | EmptyStateActionHref
}

export function EmptyState({ message, action }: EmptyStateProps) {
    const theme = useTheme()

    return (
        <View style={styles.container}>
            <Text style={[styles.message, { color: theme.color8.val }]}>{message}</Text>
            {action ? <EmptyStateAction action={action} /> : null}
        </View>
    )
}

function EmptyStateAction({ action }: { action: EmptyStateActionPress | EmptyStateActionHref }) {
    const theme = useTheme()

    if ('href' in action) {
        return (
            <Link href={action.href}>
                <Text style={[styles.actionText, { color: theme.accentColor.val }]}>
                    {action.label}
                </Text>
            </Link>
        )
    }

    return (
        <Pressable onPress={action.onPress}>
            <Text style={[styles.actionText, { color: theme.accentColor.val }]}>
                {action.label}
            </Text>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 12,
    },
    message: {
        fontSize: 15,
    },
    actionText: {
        fontSize: 15,
        fontWeight: '600',
    },
})
