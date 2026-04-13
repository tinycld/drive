import { useQuery } from '@tanstack/react-query'
import { Download, FileIcon } from 'lucide-react-native'
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native'
import { PB_SERVER_ADDR } from '~/lib/pocketbase'
import { useThemeColor } from '~/lib/use-app-theme'
import { Modal, ModalBackdrop, ModalContent } from '~/ui/modal'
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
    const mutedColor = useThemeColor('muted')
    const fgColor = useThemeColor('foreground')
    const isExpired = error.status === 410
    const title = isExpired ? 'Link expired' : 'Link not found'
    const description = isExpired
        ? 'This share link has expired or been revoked.'
        : 'This share link is invalid or the file has been removed.'

    return (
        <View
            style={{
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                gap: 16,
                padding: 24,
            }}
        >
            <FileIcon size={64} color={mutedColor} />
            <Text style={{ fontSize: 20, fontWeight: '600', color: fgColor }}>{title}</Text>
            <Text
                style={{
                    color: mutedColor,
                    textAlign: 'center',
                    maxWidth: 400,
                }}
            >
                {description}
            </Text>
        </View>
    )
}

function LoadingDisplay() {
    const mutedColor = useThemeColor('muted')

    return (
        <View
            style={{
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                gap: 16,
            }}
        >
            <ActivityIndicator size="large" />
            <Text style={{ color: mutedColor }}>Loading shared file...</Text>
        </View>
    )
}

interface PublicSharePageProps {
    token: string
}

export function PublicSharePage({ token }: PublicSharePageProps) {
    const { data, isLoading, error } = useShareLinkData(token)
    const bgColor = useThemeColor('background')

    if (isLoading) return <LoadingDisplay />
    if (error) return <ErrorDisplay error={error as ShareLinkError} />
    if (!data) return null

    const baseUrl = `${PB_SERVER_ADDR}/api/drive/share-link/${token}`
    const fileUrl = `${baseUrl}/file`
    const thumbnailUrl = `${baseUrl}/thumbnail`
    const downloadUrl = `${fileUrl}?inline=0`

    return (
        <View style={{ flex: 1, backgroundColor: bgColor }}>
            <Modal isOpen onClose={() => {}}>
                <ModalBackdrop />
                <ModalContent className="w-[95vw] h-[90vh] max-w-[1400px] p-0 rounded-xl overflow-hidden">
                    <PreviewHeader
                        name={data.name}
                        orgName={data.org_name}
                        downloadUrl={downloadUrl}
                    />
                    <View style={{ flex: 1, overflow: 'hidden' }}>
                        <PublicPreviewFrame
                            name={data.name}
                            mimeType={data.mime_type}
                            category={data.category}
                            fileUrl={fileUrl}
                            thumbnailUrl={thumbnailUrl}
                            size={data.size}
                        />
                    </View>
                </ModalContent>
            </Modal>
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
    const mutedColor = useThemeColor('muted')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')

    const handleDownload = () => {
        if (Platform.OS === 'web') window.open(downloadUrl, '_blank')
    }

    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
                gap: 12,
            }}
        >
            <View style={{ flex: 1, gap: 4 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: fgColor }}>
                    {name}
                </Text>
                {orgName ? (
                    <Text numberOfLines={1} style={{ fontSize: 12, color: mutedColor }}>
                        Shared from {orgName}
                    </Text>
                ) : null}
            </View>
            <Pressable onPress={handleDownload} style={{ padding: 6, borderRadius: 6 }} hitSlop={8}>
                <Download size={18} color={mutedColor} />
            </Pressable>
        </View>
    )
}
