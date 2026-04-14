import { Download } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { formatBytes } from '~/lib/format-utils'
import { useThemeColor } from '~/lib/use-app-theme'
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
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <FileIcon size={80} color={iconColor} />
            <Text
                style={{
                    fontSize: 20,
                    fontWeight: '600',
                    color: fgColor,
                    marginTop: 16,
                }}
            >
                {item.name}
            </Text>
            <Text style={{ fontSize: 13, color: mutedColor, marginTop: 4 }}>
                {item.mimeType} · {formatBytes(item.size)}
            </Text>
            {fileUrl && (
                <Pressable
                    onPress={handleDownload}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 20,
                        paddingHorizontal: 20,
                        paddingVertical: 12,
                        borderRadius: 8,
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
