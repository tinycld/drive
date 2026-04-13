import { useThemeColor } from 'heroui-native'
import { ActivityIndicator, Text, View } from 'react-native'
import { useDrive } from '../hooks/useDrive'

interface UploadStatusBarProps {
    isVisible: boolean
}

export function UploadStatusBar({ isVisible }: UploadStatusBarProps) {
    const [accentColor, fgColor, borderColor, bgColor] = useThemeColor([
        'accent',
        'foreground',
        'border',
        'background',
    ])
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
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderTopWidth: 1,
                backgroundColor: bgColor,
                borderTopColor: borderColor,
            }}
        >
            {activeCount > 0 && <ActivityIndicator size="small" color={accentColor} />}
            <Text style={{ fontSize: 13, color: fgColor }}>{label}</Text>
        </View>
    )
}
