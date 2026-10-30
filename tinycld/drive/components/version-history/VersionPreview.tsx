import { downloadFromUrl } from '@tinycld/core/file-viewer/file-url'
import { HtmlSurface } from '@tinycld/core/file-viewer/HtmlSurface'
import { getPreviewEntry } from '@tinycld/core/file-viewer/registry'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { useVersionHtml } from '../../hooks/useVersionHtml'
import { versionFileUrl } from '../../lib/item-file-url'

interface VersionPreviewProps {
    versionId: string | undefined
    itemName: string
    mimeType: string
}

function useVersionPreview({ versionId, itemName, mimeType }: VersionPreviewProps) {
    const { html, isLoading, error, isUnsupported } = useVersionHtml({ versionId, mode: 'render' })
    const css = getPreviewEntry(mimeType)?.htmlCss ?? ''
    const download = () => {
        if (!versionId) return
        void (async () => {
            const url = await versionFileUrl(versionId)
            downloadFromUrl(url, itemName, mimeType)
        })()
    }
    let message = ''
    if (isUnsupported) message = 'No preview for this file type'
    else if (error) message = 'Cannot show this version'
    return { html, css, isLoading, message, download }
}

export function VersionPreview(props: VersionPreviewProps) {
    const { html, css, isLoading, message, download } = useVersionPreview(props)

    if (isLoading) {
        return (
            <View className="flex-1 items-center justify-center">
                <ActivityIndicator />
            </View>
        )
    }
    if (message || html === undefined) {
        return <PreviewMessage message={message} onDownload={download} />
    }
    return (
        <ScrollView className="flex-1 bg-background">
            <HtmlSurface html={html} css={css} ariaLabel="Version preview" />
        </ScrollView>
    )
}

function PreviewMessage({ message, onDownload }: { message: string; onDownload: () => void }) {
    if (!message) return null
    return (
        <View className="flex-1 items-center justify-center gap-3 p-6">
            <Text className="text-sm text-muted-foreground">{message}</Text>
            <Button variant="outline" size="sm" onPress={onDownload}>
                <ButtonText>Download</ButtonText>
            </Button>
        </View>
    )
}
