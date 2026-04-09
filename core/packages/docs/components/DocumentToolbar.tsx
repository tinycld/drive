import type { EditorBridge } from '@10play/tentap-editor'
import {
    ArrowLeft,
    Bold,
    Heading1,
    Heading2,
    Italic,
    Link,
    List,
    ListOrdered,
    Quote,
    Underline,
} from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTheme } from 'tamagui'
import { ToolbarIconButton } from '~/components/ToolbarIconButton'

interface DocumentToolbarProps {
    editor: EditorBridge
    onBack: () => void
}

export function DocumentToolbar({ editor, onBack }: DocumentToolbarProps) {
    const theme = useTheme()

    return (
        <View style={[styles.toolbar, { borderBottomColor: theme.borderColor.val }]}>
            <Pressable onPress={onBack} style={styles.backButton}>
                <ArrowLeft size={20} color={theme.color.val} />
            </Pressable>

            <View style={styles.separator} />

            <View style={styles.formatGroup}>
                <ToolbarIconButton icon={Bold} onPress={() => editor.toggleBold()} label="Bold" />
                <ToolbarIconButton
                    icon={Italic}
                    onPress={() => editor.toggleItalic()}
                    label="Italic"
                />
                <ToolbarIconButton
                    icon={Underline}
                    onPress={() => editor.toggleUnderline()}
                    label="Underline"
                />
            </View>

            <View style={styles.separator} />

            <View style={styles.formatGroup}>
                <ToolbarIconButton
                    icon={Heading1}
                    onPress={() => editor.toggleHeading(1)}
                    label="Heading 1"
                />
                <ToolbarIconButton
                    icon={Heading2}
                    onPress={() => editor.toggleHeading(2)}
                    label="Heading 2"
                />
            </View>

            <View style={styles.separator} />

            <View style={styles.formatGroup}>
                <ToolbarIconButton
                    icon={List}
                    onPress={() => editor.toggleBulletList()}
                    label="Bullet list"
                />
                <ToolbarIconButton
                    icon={ListOrdered}
                    onPress={() => editor.toggleOrderedList()}
                    label="Numbered list"
                />
                <ToolbarIconButton
                    icon={Quote}
                    onPress={() => editor.toggleBlockquote()}
                    label="Blockquote"
                />
                <ToolbarIconButton
                    icon={Link}
                    onPress={() => editor.setLink('https://')}
                    label="Link"
                />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderBottomWidth: 1,
        gap: 2,
    },
    backButton: {
        padding: 8,
        borderRadius: 6,
    },
    formatGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    separator: {
        width: 1,
        height: 20,
        marginHorizontal: 6,
        opacity: 0.2,
    },
})
