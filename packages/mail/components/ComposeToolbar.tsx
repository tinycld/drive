import { Link2, Paperclip, Trash2 } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'

interface ComposeToolbarProps {
    onDiscard: () => void
}

export function ComposeToolbar({ onDiscard }: ComposeToolbarProps) {
    const theme = useTheme()

    return (
        <View style={[styles.toolbar, { borderTopColor: theme.borderColor.val }]}>
            <Pressable style={[styles.sendButton, { backgroundColor: theme.accentBackground.val }]}>
                <Text style={[styles.sendText, { color: theme.accentColor.val }]}>Send</Text>
            </Pressable>
            <View style={styles.formatActions}>
                <Pressable style={styles.iconButton}>
                    <Paperclip size={16} color={theme.color8.val} />
                </Pressable>
                <Pressable style={styles.iconButton}>
                    <Link2 size={16} color={theme.color8.val} />
                </Pressable>
            </View>
            <View style={styles.spacer} />
            <Pressable style={styles.iconButton} onPress={onDiscard}>
                <Trash2 size={16} color={theme.color8.val} />
            </Pressable>
        </View>
    )
}

const styles = StyleSheet.create({
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 44,
        paddingHorizontal: 12,
        borderTopWidth: 1,
        gap: 4,
    },
    sendButton: {
        paddingHorizontal: 20,
        paddingVertical: 6,
        borderRadius: 20,
    },
    sendText: {
        fontSize: 14,
        fontWeight: '600',
    },
    formatActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 4,
    },
    iconButton: {
        padding: 6,
        borderRadius: 20,
    },
    spacer: {
        flex: 1,
    },
})
