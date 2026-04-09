import { useQuery } from '@tanstack/react-query'
import { Download, FileIcon } from 'lucide-react-native'
import { Platform, Pressable, StyleSheet } from 'react-native'
import {
    Dialog,
    H3,
    Paragraph,
    SizableText,
    Spinner,
    useTheme,
    View,
    XStack,
    YStack,
} from 'tamagui'
import { PB_SERVER_ADDR } from '~/lib/pocketbase'
import { PublicPreviewFrame } from './PublicPreviewFrame'

interface ShareLinkMetadata {
    name: string
    mime_type: string
    size: number
    category: string
    file_url: string
    thumbnail_url: string
    updated: string
    org_name: string
}

function useShareLinkData(token: string) {
    return useQuery<ShareLinkMetadata>({
        queryKey: ['share-link', token],
        queryFn: async () => {
            const resp = await fetch(`${PB_SERVER_ADDR}/api/drive/share-link/${token}`)
            if (!resp.ok) {
                const body = await resp.json().catch(() => ({}))
                throw new ShareLinkError(resp.status, body.error ?? 'Failed to load')
            }
            return resp.json()
        },
        enabled: !!token,
        retry: false,
    })
}

class ShareLinkError extends Error {
    status: number
    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

function ErrorDisplay({ error }: { error: ShareLinkError }) {
    const theme = useTheme()
    const isExpired = error.status === 410
    const title = isExpired ? 'Link expired' : 'Link not found'
    const description = isExpired
        ? 'This share link has expired or been revoked.'
        : 'This share link is invalid or the file has been removed.'

    return (
        <YStack items="center" justify="center" flex={1} gap="$4" p="$6">
            <FileIcon size={64} color={theme.color8.val} />
            <H3 color="$color">{title}</H3>
            <Paragraph color="$color8" text="center" maxW={400}>
                {description}
            </Paragraph>
        </YStack>
    )
}

function LoadingDisplay() {
    return (
        <YStack items="center" justify="center" flex={1} gap="$4">
            <Spinner size="large" />
            <Paragraph color="$color8">Loading shared file...</Paragraph>
        </YStack>
    )
}

interface PublicSharePageProps {
    token: string
}

export function PublicSharePage({ token }: PublicSharePageProps) {
    const { data, isLoading, error } = useShareLinkData(token)

    if (isLoading) return <LoadingDisplay />
    if (error) return <ErrorDisplay error={error as ShareLinkError} />
    if (!data) return null

    const baseUrl = `${PB_SERVER_ADDR}/api/drive/share-link/${token}`
    const fileUrl = `${baseUrl}/file`
    const thumbnailUrl = `${baseUrl}/thumbnail`
    const downloadUrl = `${fileUrl}?inline=0`

    return (
        <View style={styles.backdrop} backgroundColor="$background">
            <Dialog modal open>
                <Dialog.Portal>
                    <Dialog.Overlay key="overlay" opacity={0.6} backgroundColor="$shadow6" />
                    <Dialog.Content
                        key="content"
                        bordered
                        elevate
                        padding={0}
                        width="95vw"
                        height="90vh"
                        maxWidth={1400}
                        backgroundColor="$background"
                        borderRadius={12}
                        overflow="hidden"
                    >
                        <PreviewHeader
                            name={data.name}
                            orgName={data.org_name}
                            downloadUrl={downloadUrl}
                        />
                        <View flex={1} overflow="hidden">
                            <PublicPreviewFrame
                                name={data.name}
                                mimeType={data.mime_type}
                                category={data.category}
                                fileUrl={fileUrl}
                                thumbnailUrl={thumbnailUrl}
                                size={data.size}
                            />
                        </View>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog>
        </View>
    )
}

function PreviewHeader({
    name,
    orgName,
    downloadUrl,
}: {
    name: string
    orgName: string
    downloadUrl: string
}) {
    const theme = useTheme()

    const handleDownload = () => {
        if (Platform.OS === 'web') window.open(downloadUrl, '_blank')
    }

    return (
        <XStack
            items="center"
            px="$4"
            py="$3"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
            gap="$3"
        >
            <YStack flex={1} gap="$1">
                <SizableText size="$4" fontWeight="600" color="$color" numberOfLines={1}>
                    {name}
                </SizableText>
                {orgName ? (
                    <SizableText size="$2" color="$color8" numberOfLines={1}>
                        Shared from {orgName}
                    </SizableText>
                ) : null}
            </YStack>
            <Pressable onPress={handleDownload} style={styles.headerButton} hitSlop={8}>
                <Download size={18} color={theme.color8.val} />
            </Pressable>
        </XStack>
    )
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
    },
    headerButton: {
        padding: 6,
        borderRadius: 6,
    },
})
