import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from 'tamagui'

export default function ProfileTab() {
    const theme = useTheme()

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Profile Tab</Text>
            <Text style={[styles.description, { color: theme.color8.val }]}>Your profile information goes here.</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    description: {
        fontSize: 16,
        textAlign: 'center',
    },
})
