import { Plus } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import { useSpreadsheet } from '../hooks/useSpreadsheet'

export function SheetTabs() {
    const theme = useTheme()
    const { sheets, activeSheetId, setActiveSheet, addSheet, isReadOnly } = useSpreadsheet()

    const handleAdd = () => {
        addSheet(`Sheet ${sheets.length + 1}`)
    }

    return (
        <View style={[styles.container, { borderTopColor: theme.borderColor.val }]}>
            {sheets.map(sheet => {
                const isActive = sheet.id === activeSheetId
                return (
                    <Pressable
                        key={sheet.id}
                        onPress={() => setActiveSheet(sheet.id)}
                        style={[
                            styles.tab,
                            {
                                borderColor: theme.borderColor.val,
                                backgroundColor: isActive
                                    ? theme.background.val
                                    : `${theme.color8.val}10`,
                            },
                            isActive && { borderBottomColor: 'transparent' },
                        ]}
                    >
                        <Text
                            style={[
                                styles.tabText,
                                {
                                    color: isActive ? theme.color.val : theme.color8.val,
                                    fontWeight: isActive ? '600' : '400',
                                },
                            ]}
                            numberOfLines={1}
                        >
                            {sheet.name}
                        </Text>
                    </Pressable>
                )
            })}
            {!isReadOnly && (
                <Pressable onPress={handleAdd} style={styles.addButton}>
                    <Plus size={16} color={theme.color8.val} />
                </Pressable>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        borderTopWidth: 1,
        height: 32,
        paddingLeft: 4,
        gap: 1,
    },
    tab: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderWidth: 1,
        borderBottomWidth: 1,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        maxWidth: 140,
    },
    tabText: {
        fontSize: 12,
    },
    addButton: {
        padding: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
})
