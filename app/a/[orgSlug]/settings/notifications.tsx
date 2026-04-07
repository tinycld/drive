import { Bell, BellOff } from 'lucide-react-native'
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native'
import { ScrollView, SizableText, Spinner, useTheme } from 'tamagui'
import { usePushSubscription } from '~/lib/use-push-subscription'

export default function NotificationsSettings() {
    return (
        <ScrollView flex={1} backgroundColor="$background" contentContainerStyle={{ flexGrow: 1 }}>
            <View style={styles.container}>
                <SizableText size="$8" fontWeight="bold" color="$color" marginBottom="$4">
                    Notifications
                </SizableText>

                <PushNotificationsSection />
            </View>
        </ScrollView>
    )
}

function PushNotificationsSection() {
    const theme = useTheme()
    const { isSupported, isSubscribed, subscribe, unsubscribe, isPending } = usePushSubscription()

    if (Platform.OS !== 'web') {
        return (
            <SectionCard>
                <SizableText size="$5" color="$color">
                    Push notifications are managed by your device settings.
                </SizableText>
            </SectionCard>
        )
    }

    if (!isSupported) {
        return (
            <SectionCard>
                <View style={styles.row}>
                    <BellOff size={20} color={theme.color8?.val} />
                    <View style={styles.textGroup}>
                        <SizableText size="$5" fontWeight="600" color="$color">
                            Browser Push Notifications
                        </SizableText>
                        <SizableText size="$3" color="$color8">
                            Your browser does not support push notifications. Try using a modern
                            browser like Chrome, Firefox, or Edge.
                        </SizableText>
                    </View>
                </View>
            </SectionCard>
        )
    }

    const handleToggle = () => {
        if (isSubscribed) {
            unsubscribe()
        } else {
            subscribe()
        }
    }

    return (
        <SectionCard>
            <Pressable onPress={handleToggle} disabled={isPending}>
                <View style={styles.row}>
                    <Bell size={20} color={theme.color?.val} />
                    <View style={styles.textGroup}>
                        <SizableText size="$5" fontWeight="600" color="$color">
                            Browser Push Notifications
                        </SizableText>
                        <SizableText size="$3" color="$color8">
                            Receive calendar reminders even when the browser tab is closed.
                        </SizableText>
                    </View>
                    <View style={styles.toggleArea}>
                        <ToggleOrSpinner
                            isPending={isPending}
                            isSubscribed={isSubscribed}
                            onToggle={handleToggle}
                        />
                    </View>
                </View>
            </Pressable>
        </SectionCard>
    )
}

function ToggleOrSpinner({
    isPending,
    isSubscribed,
    onToggle,
}: {
    isPending: boolean
    isSubscribed: boolean
    onToggle: () => void
}) {
    const theme = useTheme()
    if (isPending) return <Spinner size="small" />
    return (
        <Switch
            value={isSubscribed}
            onValueChange={onToggle}
            trackColor={{ false: theme.borderColor?.val, true: theme.accentBackground?.val }}
        />
    )
}

function SectionCard({ children }: { children: React.ReactNode }) {
    const theme = useTheme()

    return (
        <View
            style={[
                styles.card,
                {
                    backgroundColor: theme.backgroundHover?.val,
                    borderColor: theme.borderColor?.val,
                },
            ]}
        >
            {children}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        padding: 24,
        maxWidth: 600,
        width: '100%',
    },
    card: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    textGroup: {
        flex: 1,
        gap: 2,
    },
    toggleArea: {
        marginLeft: 'auto',
    },
})
