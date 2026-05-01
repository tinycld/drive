import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { ActivityIndicator, Text, View } from 'react-native'
import { useDrive } from '../hooks/useDrive'

interface UploadStatusBarProps {
    isVisible: boolean
}

export function UploadStatusBar({ isVisible }: UploadStatusBarProps) {
    const accentColor = useThemeColor('primary')
    const { uploadingFiles } = useDrive()

    if (!isVisible) return null

    const activeCount = uploadingFiles.filter((f) => f.status !== 'done' && f.status !== 'error').length
    const label =
        activeCount > 0 ? `Uploading ${activeCount} file${activeCount !== 1 ? 's' : ''}...` : 'Upload complete'

    return (
        <View className="flex-row items-center gap-2 px-4 py-2.5 border-t border-border bg-background">
            {activeCount > 0 && <ActivityIndicator size="small" color={accentColor} />}
            <Text className="text-foreground" style={{ fontSize: 13 }}>
                {label}
            </Text>
        </View>
    )
}
