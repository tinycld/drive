import { Menu } from '@tamagui/menu'
import type { LucideIcon } from 'lucide-react-native'
import { Check } from 'lucide-react-native'
import { useTheme, View } from 'tamagui'
import { ToolbarIconButton } from './ToolbarIconButton'

interface ToolbarMenuProps {
    icon: LucideIcon
    label: string
    children: React.ReactNode
}

export function ToolbarMenu({ icon, label, children }: ToolbarMenuProps) {
    return (
        <Menu>
            <Menu.Trigger asChild>
                <View>
                    <ToolbarIconButton icon={icon} label={label} onPress={() => {}} />
                </View>
            </Menu.Trigger>

            <Menu.Portal zIndex={100}>
                <Menu.Content
                    borderRadius={8}
                    minWidth={200}
                    backgroundColor="$background"
                    borderColor="$borderColor"
                    borderWidth={1}
                    paddingVertical="$1"
                    shadowColor="#000"
                    shadowOffset={{ width: 0, height: 4 }}
                    shadowOpacity={0.15}
                    shadowRadius={12}
                >
                    {children}
                </Menu.Content>
            </Menu.Portal>
        </Menu>
    )
}

interface MenuActionItemProps {
    label: string
    icon?: LucideIcon
    onPress: () => void
    isActive?: boolean
    colorDot?: string
}

export function MenuActionItem({
    label,
    icon: Icon,
    onPress,
    isActive,
    colorDot,
}: MenuActionItemProps) {
    const theme = useTheme()

    return (
        <Menu.Item key={label} onSelect={onPress} gap="$2">
            {Icon ? (
                <Menu.ItemIcon>
                    <Icon size={16} color={theme.color8.val} />
                </Menu.ItemIcon>
            ) : colorDot ? (
                <View
                    width={12}
                    height={12}
                    borderRadius={6}
                    marginHorizontal={2}
                    style={{ backgroundColor: colorDot }}
                />
            ) : (
                <View width={16} />
            )}
            <Menu.ItemTitle size="$3">{label}</Menu.ItemTitle>
            {isActive ? <Check size={16} color={theme.accentBackground.val} /> : null}
        </Menu.Item>
    )
}
