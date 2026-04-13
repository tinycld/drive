import { Image, View } from 'react-native'
import { getFileURL } from '../../lib/file-url'
import type { PreviewProps } from '../../lib/preview-registry'

export function ImagePreview({ item }: PreviewProps) {
    const fileUrl = getFileURL(item)

    if (!fileUrl) return null

    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <Image
                source={{ uri: fileUrl }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
            />
        </View>
    )
}
