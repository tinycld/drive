import type { LucideIcon } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'

interface SidebarItemProps {
    label: string
    icon?: LucideIcon
    isActive?: boolean
    badge?: string | number
    onPress?: () => void
}

export function SidebarItem({ label, icon: Icon, isActive, badge, onPress }: SidebarItemProps) {
    const theme = useTheme()

    return (
        <Pressable
            onPress={onPress}
            style={[styles.item, isActive && { backgroundColor: `${theme.activeIndicator.val}18` }]}
        >
            {Icon && (
                <Icon size={18} color={isActive ? theme.activeIndicator.val : theme.color8.val} />
            )}
            <Text
                style={[
                    styles.label,
                    { color: isActive ? theme.activeIndicator.val : theme.color.val },
                    isActive && styles.labelActive,
                ]}
                numberOfLines={1}
            >
                {label}
            </Text>
            {badge != null && (
                <View style={[styles.badge, { backgroundColor: `${theme.color8.val}30` }]}>
                    <Text style={[styles.badgeText, { color: theme.color8.val }]}>{badge}</Text>
                </View>
            )}
        </Pressable>
    )
}

const styles = StyleSheet.create({
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    label: {
        fontSize: 14,
        flex: 1,
    },
    labelActive: {
        fontWeight: '600',
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        minWidth: 22,
        alignItems: 'center',
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
    },
})
