import { Platform, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'

interface EmailBodyProps {
    html: string
}

export function EmailBody({ html }: EmailBodyProps) {
    const theme = useTheme()

    if (Platform.OS === 'web') {
        return (
            <View style={styles.container}>
                <div
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: rendering email body html
                    dangerouslySetInnerHTML={{ __html: html }}
                    style={{
                        color: theme.color.val,
                        fontSize: 14,
                        lineHeight: 1.6,
                    }}
                />
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <Text style={[styles.fallback, { color: theme.color.val }]}>
                {html.replace(/<[^>]*>/g, '')}
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        flex: 1,
    },
    fallback: {
        fontSize: 14,
        lineHeight: 22,
    },
})
