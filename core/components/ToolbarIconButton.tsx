import type { LucideIcon } from 'lucide-react-native'
import { Platform, Pressable, StyleSheet } from 'react-native'
import { useTheme } from 'tamagui'

interface ToolbarIconButtonProps {
    icon: LucideIcon
    label: string
    onPress: () => void
    size?: number
    color?: string
    disabled?: boolean
}

export function ToolbarIconButton({
    icon: Icon,
    label,
    onPress,
    size = 18,
    color,
    disabled,
}: ToolbarIconButtonProps) {
    const theme = useTheme()
    const iconColor = color ?? theme.color8.val

    const webProps = Platform.OS === 'web' ? { title: label } : {}

    return (
        <Pressable
            style={[styles.iconButton, disabled && styles.disabled]}
            onPress={onPress}
            accessibilityLabel={label}
            disabled={disabled}
            {...webProps}
        >
            <Icon size={size} color={iconColor} />
        </Pressable>
    )
}

const styles = StyleSheet.create({
    iconButton: {
        padding: 8,
        borderRadius: 20,
    },
    disabled: {
        opacity: 0.4,
    },
})
