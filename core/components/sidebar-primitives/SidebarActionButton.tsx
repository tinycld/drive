import type { LucideIcon } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'

interface SidebarActionButtonProps {
    label: string
    icon?: LucideIcon
    onPress: () => void
}

export function SidebarActionButton({ label, icon: Icon, onPress }: SidebarActionButtonProps) {
    const theme = useTheme()

    return (
        <View style={styles.wrapper}>
            <Pressable
                style={[styles.button, { backgroundColor: theme.accentBackground.val }]}
                onPress={onPress}
            >
                {Icon ? <Icon size={16} color={theme.accentColor.val} /> : null}
                <Text style={[styles.text, { color: theme.accentColor.val }]}>{label}</Text>
            </Pressable>
        </View>
    )
}

const styles = StyleSheet.create({
    wrapper: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
    },
    text: {
        fontSize: 14,
        fontWeight: '600',
    },
})
