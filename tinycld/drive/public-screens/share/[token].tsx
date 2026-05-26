import { useQuery } from '@tanstack/react-query'
import {
    PublicShareError,
    PublicShareLayout,
    type PublicShareMetadata,
} from '@tinycld/core/components/public-share'
import { getPublicPreviewConfig, getShareEditor } from '@tinycld/core/file-viewer/registry'
import { type ShareSession, useShareSession } from '@tinycld/core/lib/anon-identity'
import { useShareEditorMount } from '@tinycld/core/lib/editor/use-share-editor-mount'
import { useAuth } from '@tinycld/core/lib/auth'
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

    // Calc/text (and any doc type with a registered share editor or public
    // preview) → mount the real editor read-only for the anon visitor.
    if (getShareEditor(session.mimeType) || getPublicPreviewConfig(session.mimeType)) {
        return <AnonymousEditorView token={token} session={session} />
    }

    // Non-document files (images/pdf/etc): generic download layout.
    return (
        <PublicShareLayout
            queryKey={['drive-share-link', token]}
            fetchMetadata={() => fetchShareMetadata(token)}
        />
    )
}

// Mounts the real calc/text editor read-only for an anonymous share-link
// visitor (View 3). The editor is registered per-mime in core's share-
// editor registry by the calc/text packages; we look it up and feed it
// the anonymous, read-only EditorMount. The server admits the anon to the
// realtime room read-only and the broker write-gate blocks any writes, so
// this is genuinely view-only even though it's the full editor.
function AnonymousEditorView({ token, session }: { token: string; session: ShareSession }) {
    const { mount, isLoading } = useShareEditorMount(token)
    const entry = getShareEditor(session.mimeType)
    const ShareEditor = entry?.component

    const subtitle = session.orgName
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
                        {mount != null && ShareEditor != null ? (
                            <ShareEditor mount={mount} />
                        ) : isLoading ? (
                            <FullScreenSpinner />
                        ) : (
                            <PreviewCommentRail session={session} />
                        )}
                    </View>
                </ModalContent>
            </Modal>
        </View>
    )
}

function FullScreenSpinner() {
    return (
        <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
        </View>
    )
}
