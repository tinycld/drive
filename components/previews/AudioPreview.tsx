import { useThemeColor } from 'heroui-native'
import { Platform, Text, View } from 'react-native'
import { getFileURL } from '../../lib/file-url'
import type { PreviewProps } from '../../lib/preview-registry'
import { getFileIcon } from '../file-icons'
import { GenericPreview } from './GenericPreview'

export function AudioPreview(props: PreviewProps) {
    const { item } = props
    const mutedColor = useThemeColor('muted')
    const fgColor = useThemeColor('foreground')
    const { icon: FileIcon, color: iconColor } = getFileIcon(item.category, mutedColor)
    const fileUrl = getFileURL(item)

    if (!fileUrl) return null

    if (Platform.OS === 'web') {
        return (
            <View
                style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 32,
                }}
            >
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
                <View style={{ width: '100%', maxWidth: 400, marginTop: 24 }}>
                    {/* biome-ignore lint/a11y/useMediaCaption: captions not available for user uploads */}
                    <audio src={fileUrl} controls style={{ width: '100%' }} />
                </View>
            </View>
        )
    }

    return <GenericPreview {...props} />
}
