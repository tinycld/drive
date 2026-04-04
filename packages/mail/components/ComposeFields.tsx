import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useTheme } from 'tamagui'

export function ComposeFields() {
    const theme = useTheme()

    const borderStyle = { borderBottomColor: theme.borderColor.val }
    const inputStyle = [styles.fieldInput, { color: theme.color.val }]

    return (
        <View>
            <View style={[styles.fieldRow, borderStyle]}>
                <Text style={[styles.fieldLabel, { color: theme.color8.val }]}>To</Text>
                <TextInput style={inputStyle} placeholderTextColor={theme.placeholderColor.val} />
            </View>
            <View style={[styles.fieldRow, borderStyle]}>
                <Text style={[styles.fieldLabel, { color: theme.color8.val }]}>Subject</Text>
                <TextInput style={inputStyle} placeholderTextColor={theme.placeholderColor.val} />
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    fieldRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        height: 36,
        borderBottomWidth: 1,
    },
    fieldLabel: {
        fontSize: 13,
        width: 56,
    },
    fieldInput: {
        flex: 1,
        fontSize: 13,
    },
})
