import { Image, View } from 'react-native'
import { getFileURL } from '../../lib/file-url'
import type { PreviewProps } from '../../lib/preview-registry'

export function ImagePreview({ item }: PreviewProps) {
    const fileUrl = getFileURL(item)

    if (!fileUrl) return null

    return (
        <View className="flex-1 items-center justify-center p-4">
            <Image source={{ uri: fileUrl }} className="w-full h-full" resizeMode="contain" />
        </View>
    )
}
