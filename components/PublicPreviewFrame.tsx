import { FileIcon } from 'lucide-react-native'
import { Platform, StyleSheet } from 'react-native'
import { Image, Paragraph, useTheme, View, YStack } from 'tamagui'
import { PdfCanvasViewer } from './PdfCanvasViewer'

interface PublicPreviewFrameProps {
    name: string
    mimeType: string
    category: string
    fileUrl: string
    thumbnailUrl: string
    size: number
}

function formatFileSize(bytes: number) {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

export function PublicPreviewFrame({
    name,
    mimeType,
    category,
    fileUrl,
    size,
}: PublicPreviewFrameProps) {
    const inlineUrl = `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}inline=1`

    if (category === 'image') return <ImagePreview url={inlineUrl} name={name} />
    if (category === 'pdf') return <PdfPreview url={inlineUrl} />
    if (category === 'video') return <VideoPreview url={inlineUrl} mimeType={mimeType} />
    if (category === 'audio')
        return <AudioPreview url={inlineUrl} name={name} mimeType={mimeType} />

    return <GenericPreview name={name} mimeType={mimeType} size={size} />
}

function ImagePreview({ url, name }: { url: string; name: string }) {
    return (
        <View style={styles.centered}>
            <Image src={url} alt={name} objectFit="contain" style={styles.imagePreview} />
        </View>
    )
}

function PdfPreview({ url }: { url: string }) {
    if (Platform.OS !== 'web') {
        return <GenericPreview name="PDF Document" mimeType="application/pdf" size={0} />
    }

    return <PdfCanvasViewer url={url} />
}

function VideoPreview({ url, mimeType }: { url: string; mimeType: string }) {
    if (Platform.OS !== 'web') {
        return <GenericPreview name="Video" mimeType={mimeType} size={0} />
    }

    return (
        <View style={styles.centered}>
            {/* biome-ignore lint/a11y/useMediaCaption: shared file preview without captions */}
            <video src={url} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
        </View>
    )
}

function AudioPreview({ url, name, mimeType }: { url: string; name: string; mimeType: string }) {
    const theme = useTheme()

    if (Platform.OS !== 'web') {
        return <GenericPreview name={name} mimeType={mimeType} size={0} />
    }

    return (
        <YStack items="center" justify="center" flex={1} gap="$4" p="$6">
            <FileIcon size={64} color={theme.color8.val} />
            <Paragraph fontWeight="600" color="$color">
                {name}
            </Paragraph>
            {/* biome-ignore lint/a11y/useMediaCaption: shared file preview without captions */}
            <audio src={url} controls style={{ width: '100%', maxWidth: 400 }} />
        </YStack>
    )
}

function GenericPreview({
    name,
    mimeType,
    size,
}: {
    name: string
    mimeType: string
    size: number
}) {
    const theme = useTheme()

    return (
        <YStack items="center" justify="center" flex={1} gap="$4" p="$6">
            <FileIcon size={64} color={theme.color8.val} />
            <Paragraph fontWeight="600" color="$color" text="center">
                {name}
            </Paragraph>
            <Paragraph size="$2" color="$color8">
                {mimeType || 'Unknown type'}
                {size > 0 ? ` \u2022 ${formatFileSize(size)}` : ''}
            </Paragraph>
        </YStack>
    )
}

const styles = StyleSheet.create({
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    imagePreview: {
        width: '100%',
        height: '100%',
    },
})
