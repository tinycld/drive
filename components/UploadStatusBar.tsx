import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useTheme } from 'tamagui'
import { useDrive } from '../hooks/useDrive'

interface UploadStatusBarProps {
    isVisible: boolean
}

export function UploadStatusBar({ isVisible }: UploadStatusBarProps) {
    const theme = useTheme()
    const { uploadingFiles } = useDrive()

    if (!isVisible) return null

    const activeCount = uploadingFiles.filter(
        f => f.status !== 'done' && f.status !== 'error'
    ).length
    const label =
        activeCount > 0
            ? `Uploading ${activeCount} file${activeCount !== 1 ? 's' : ''}...`
            : 'Upload complete'

    return (
        <View
            style={[
                styles.bar,
                { backgroundColor: theme.background.val, borderTopColor: theme.borderColor.val },
            ]}
        >
            {activeCount > 0 && (
                <ActivityIndicator size="small" color={theme.accentBackground.val} />
            )}
            <Text style={[styles.text, { color: theme.color.val }]}>{label}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: 1,
    },
    text: {
        fontSize: 13,
    },
})
