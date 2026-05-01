import { formatBytes } from '@tinycld/core/lib/format-utils'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Download } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { getFileURL } from '../../lib/file-url'
import type { PreviewProps } from '../../lib/preview-registry'
import { getFileIcon } from '../file-icons'

export function GenericPreview({ item }: PreviewProps) {
    const mutedColor = useThemeColor('muted-foreground')
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
                className="mt-4 text-foreground"
                style={{
                    fontSize: 20,
                    fontWeight: '600',
                }}
            >
                {item.name}
            </Text>
            <Text className="mt-1 text-muted-foreground" style={{ fontSize: 13 }}>
                {item.mimeType} · {formatBytes(item.size)}
            </Text>
            {fileUrl && (
                <Pressable
                    onPress={handleDownload}
                    className="flex-row items-center gap-2 mt-5 px-5 py-3 rounded-lg bg-primary"
                >
                    <Download size={16} color={primaryFgColor} />
                    <Text className="text-primary-foreground" style={{ fontWeight: '600' }}>
                        Download
                    </Text>
                </Pressable>
            )}
        </View>
    )
}
