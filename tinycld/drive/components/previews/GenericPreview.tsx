import { Download } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { formatBytes } from '@tinycld/core/lib/format-utils'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { getFileURL } from '../../lib/file-url'
import type { PreviewProps } from '../../lib/preview-registry'
import { getFileIcon } from '../file-icons'

export function GenericPreview({ item }: PreviewProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const primaryColor = useThemeColor('primary')
    const primaryFgColor = useThemeColor('primary-foreground')
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, mutedColor)
    const fileUrl = getFileURL(item)

    const handleDownload = () => {
        if (!fileUrl) return
        if (typeof window !== 'undefined') {
            const a = document.createElement('a')
            a.href = fileUrl
            a.download = item.name
            a.click()
        }
    }

    return (
        <View className="flex-1 items-center justify-center p-8">
            <FileIcon size={80} color={iconColor} />
            <Text
                className="mt-4"
                style={{
                    fontSize: 20,
                    fontWeight: '600',
                    color: fgColor,
                }}
            >
                {item.name}
            </Text>
            <Text className="mt-1" style={{ fontSize: 13, color: mutedColor }}>
                {item.mimeType} · {formatBytes(item.size)}
            </Text>
            {fileUrl && (
                <Pressable
                    onPress={handleDownload}
                    className="flex-row items-center gap-2 mt-5 px-5 py-3 rounded-lg"
                    style={{
                        backgroundColor: primaryColor,
                    }}
                >
                    <Download size={16} color={primaryFgColor} />
                    <Text style={{ fontWeight: '600', color: primaryFgColor }}>Download</Text>
                </Pressable>
            )}
        </View>
    )
}
