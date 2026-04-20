import { Platform, Text, View } from 'react-native'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { getFileURL } from '../../lib/file-url'
import type { PreviewProps } from '../../lib/preview-registry'
import { getFileIcon } from '../file-icons'
import { GenericPreview } from './GenericPreview'

export function AudioPreview(props: PreviewProps) {
    const { item } = props
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, mutedColor)
    const fileUrl = getFileURL(item)

    if (!fileUrl) return null

    if (Platform.OS === 'web') {
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
                <View className="w-full mt-6" style={{ maxWidth: 400 }}>
                    {/* biome-ignore lint/a11y/useMediaCaption: captions not available for user uploads */}
                    <audio src={fileUrl} controls style={{ width: '100%' }} />
                </View>
            </View>
        )
    }

    return <GenericPreview {...props} />
}
