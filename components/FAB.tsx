import type { LucideIcon } from 'lucide-react-native'
import { Pressable, StyleSheet } from 'react-native'
import { useTheme } from 'tamagui'

interface FABProps {
    icon: LucideIcon
    onPress: () => void
    accessibilityLabel: string
    isVisible: boolean
    size?: number
    iconSize?: number
}

export function FAB({
    icon: Icon,
    onPress,
    accessibilityLabel,
    isVisible,
    size = 56,
    iconSize = 22,
}: FABProps) {
    const theme = useTheme()

    if (!isVisible) return null

    return (
        <Pressable
            style={[
                styles.fab,
                {
                    backgroundColor: theme.accentBackground.val,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                },
            ]}
            onPress={onPress}
            accessibilityLabel={accessibilityLabel}
        >
            <Icon size={iconSize} color={theme.accentColor.val} />
        </Pressable>
    )
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        bottom: 80,
        right: 16,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        zIndex: 50,
    },
})
