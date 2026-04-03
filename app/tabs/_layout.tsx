import { TabList, TabSlot, Tabs, TabTrigger } from 'one/ui'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useTheme } from 'tamagui'

export default function TabsLayout() {
    const theme = useTheme()

    return (
        <Tabs style={styles.container}>
            <TabSlot />
            <TabList
                style={[
                    styles.tabBar,
                    {
                        backgroundColor: theme.backgroundHover.val,
                        borderTopColor: theme.borderColor.val,
                    },
                ]}
            >
                <TabTrigger name="home" href="/tabs" asChild>
                    <CustomTab theme={theme}>Home</CustomTab>
                </TabTrigger>
                <TabTrigger name="profile" href="/tabs/profile" asChild>
                    <CustomTab theme={theme}>Profile</CustomTab>
                </TabTrigger>
                <TabTrigger name="settings" href="/tabs/settings" asChild>
                    <CustomTab theme={theme}>Settings</CustomTab>
                </TabTrigger>
            </TabList>
        </Tabs>
    )
}

interface CustomTabProps {
    children: React.ReactNode
    isFocused?: boolean
    theme: ReturnType<typeof useTheme>
    [key: string]: unknown
}

function CustomTab({ children, isFocused, theme, ...props }: CustomTabProps) {
    return (
        <Pressable
            {...props}
            style={[
                styles.tab,
                isFocused && {
                    borderBottomWidth: 2,
                    borderBottomColor: theme.accentBackground.val,
                },
            ]}
        >
            <Text
                style={[
                    styles.tabText,
                    { color: isFocused ? theme.accentBackground.val : theme.color8.val },
                    isFocused && styles.tabTextActive,
                ]}
            >
                {children}
            </Text>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    tabBar: {
        flexDirection: 'row',
        borderTopWidth: 1,
        paddingVertical: 8,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
    tabText: {
        fontSize: 14,
    },
    tabTextActive: {
        fontWeight: '600',
    },
})
