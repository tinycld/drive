import { Check, HelpCircle, X as XIcon } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'
import { SizableText, useTheme, YStack } from 'tamagui'
import type { EventGuest } from '../types'

interface EventGuestListProps {
    guests: EventGuest[]
}

function getInitials(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) return '?'
    const parts = trimmed.split(/\s+/)
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return trimmed.slice(0, 2).toUpperCase()
}

function RsvpIcon({ rsvp }: { rsvp: EventGuest['rsvp'] }) {
    const theme = useTheme()
    if (rsvp === 'accepted') return <Check size={14} color={theme.green10.val} />
    if (rsvp === 'declined') return <XIcon size={14} color={theme.red8.val} />
    if (rsvp === 'tentative') return <HelpCircle size={14} color={theme.orange10.val} />
    return null
}

export function EventGuestList({ guests }: EventGuestListProps) {
    const theme = useTheme()

    if (guests.length === 0) {
        return (
            <YStack padding="$4">
                <SizableText size="$3" color="$color8">
                    No guests
                </SizableText>
            </YStack>
        )
    }

    return (
        <YStack gap="$2">
            <SizableText size="$4" fontWeight="600" color="$color" paddingHorizontal="$1">
                Guests ({guests.length})
            </SizableText>

            {guests.map(guest => (
                <View key={guest.email} style={styles.guestRow}>
                    <View style={[styles.avatar, { backgroundColor: theme.accentBackground.val }]}>
                        <Text style={[styles.avatarText, { color: theme.accentColor.val }]}>
                            {getInitials(guest.name)}
                        </Text>
                    </View>
                    <View style={styles.guestInfo}>
                        <View style={styles.nameRow}>
                            <Text
                                style={[styles.guestName, { color: theme.color.val }]}
                                numberOfLines={1}
                            >
                                {guest.name}
                            </Text>
                            {guest.role === 'organizer' && (
                                <Text style={[styles.roleTag, { color: theme.color8.val }]}>
                                    Organizer
                                </Text>
                            )}
                        </View>
                        <View style={styles.emailRow}>
                            <Text
                                style={[styles.guestEmail, { color: theme.color8.val }]}
                                numberOfLines={1}
                            >
                                {guest.email}
                            </Text>
                            <RsvpIcon rsvp={guest.rsvp} />
                        </View>
                    </View>
                </View>
            ))}
        </YStack>
    )
}

const styles = StyleSheet.create({
    guestRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
        paddingHorizontal: 4,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 12,
        fontWeight: '600',
    },
    guestInfo: {
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    guestName: {
        fontSize: 14,
        fontWeight: '500',
    },
    roleTag: {
        fontSize: 11,
    },
    emailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    guestEmail: {
        fontSize: 12,
        flex: 1,
    },
})
