import { useQuery } from '@tanstack/react-query'
import {
    PublicShareError,
    PublicShareLayout,
    type PublicShareMetadata,
} from '@tinycld/core/components/public-share'
import { useShareSession } from '@tinycld/core/lib/anon-identity'
import { useAuth } from '@tinycld/core/lib/auth'
import { getPublicPreviewConfig } from '@tinycld/core/file-viewer/registry'
import { PB_SERVER_ADDR } from '@tinycld/core/lib/pocketbase'
import { Modal, ModalBackdrop, ModalContent } from '@tinycld/core/ui/modal'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import { PreviewCommentRail } from '../../components/PreviewCommentRail'

const shareLinkUrl = (token: string) => `${PB_SERVER_ADDR}/api/drive/share-link/${token}`

function useShareLinkRouting(token: string) {
    const auth = useAuth({ throwIfAnon: false })

    const query = useQuery<{ org_slug: string; item_id: string }>({
        queryKey: ['share-link-routing', token],
        queryFn: async () => {
            const resp = await fetch(shareLinkUrl(token))
            if (!resp.ok) throw new Error('Failed to load share link')
            return resp.json()
        },
        enabled: !!token && auth.isLoggedIn && !auth.isInitializing,
    })

    return { ...query, auth }
}

async function fetchShareMetadata(token: string): Promise<PublicShareMetadata> {
    const resp = await fetch(shareLinkUrl(token))
    if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new PublicShareError(resp.status, body.error ?? 'Failed to load')
    }
    return resp.json()
}

export default function ShareTokenPage() {
    const { token = '' } = useLocalSearchParams<{ token: string }>()
    const { data, auth } = useShareLinkRouting(token)

    if (auth.isInitializing) {
        return <FullScreenSpinner />
    }

    // Logged-in viewers with org access bypass the public preview and land
    // directly on the drive workspace with the file's preview pane open.
    if (auth.isLoggedIn && data?.org_slug && data?.item_id) {
        return <Redirect href={`/a/${data.org_slug}/drive?file=${data.item_id}&preview=1`} />
    }

    if (auth.isLoggedIn && !data) {
        return <FullScreenSpinner />
    }

    // Anonymous visitor: mint a share session, then render the document
    // preview (calc/text) or fall back to the generic file layout.
    return <AnonymousShareView token={token} />
}

// AnonymousShareView mints the share session for an anonymous visitor and
// chooses the preview surface. Editable links redirect to the standalone
// editor; calc/text links render the read-only HTML preview; everything
// else uses the generic download/preview layout.
function AnonymousShareView({ token }: { token: string }) {
    const { data: session, isLoading, error } = useShareSession(token)

    if (isLoading) return <FullScreenSpinner />

    // If the session mint failed, fall back to the generic layout, which
    // re-fetches metadata and renders the proper expired/not-found copy.
    if (error || !session) {
        return (
            <PublicShareLayout
                queryKey={['drive-share-link', token]}
                fetchMetadata={() => fetchShareMetadata(token)}
            />
        )
    }

    // Calc/text documents get the rich read-only HTML preview with
    // comments. Editor-role links also land here for now: anonymous
    // editing is wired on the server but the standalone editor screen is
    // a follow-up, so we surface a "sign in to edit" hint and let anon
    // visitors view + comment in the meantime.
    if (getPublicPreviewConfig(session.mimeType)) {
        const subtitle =
            session.role === 'editor'
                ? `Shared from ${session.orgName || 'an organization'} · sign in to edit · viewing as ${session.displayName}`
                : session.orgName
                  ? `Shared from ${session.orgName} · viewing as ${session.displayName}`
                  : `Viewing as ${session.displayName}`
        return (
            <View className="flex-1 bg-background">
                <Modal isOpen onClose={() => {}}>
                    <ModalBackdrop />
                    <ModalContent className="w-[95vw] h-[90vh] max-w-[1400px] p-0 rounded-xl overflow-hidden">
                        <View className="flex-row items-center px-4 py-3 gap-3 border-b border-border">
                            <View className="flex-1 gap-1">
                                <Text
                                    numberOfLines={1}
                                    className="text-foreground"
                                    style={{ fontSize: 16, fontWeight: '600' }}
                                >
                                    {session.name}
                                </Text>
                                <Text
                                    numberOfLines={1}
                                    className="text-muted-foreground"
                                    style={{ fontSize: 12 }}
                                >
                                    {subtitle}
                                </Text>
                            </View>
                        </View>
                        <View className="flex-1 overflow-hidden">
                            <PreviewCommentRail session={session} />
                        </View>
                    </ModalContent>
                </Modal>
            </View>
        )
    }

    // Non-document files (images/pdf/etc): generic download layout.
    return (
        <PublicShareLayout
            queryKey={['drive-share-link', token]}
            fetchMetadata={() => fetchShareMetadata(token)}
        />
    )
}

function FullScreenSpinner() {
    return (
        <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
        </View>
    )
}
