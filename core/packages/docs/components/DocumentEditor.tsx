import { type EditorBridge, RichText } from '@10play/tentap-editor'
import { StyleSheet, View } from 'react-native'

interface DocumentEditorProps {
    editor: EditorBridge
}

export function DocumentEditor({ editor }: DocumentEditorProps) {
    return (
        <View style={styles.container}>
            <RichText editor={editor} scrollEnabled />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
})
