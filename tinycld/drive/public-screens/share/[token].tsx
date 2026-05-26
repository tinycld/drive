import { useQuery } from '@tanstack/react-query'
import {
    PublicShareError,
    PublicShareLayout,
    type PublicShareMetadata,
} from '@tinycld/core/components/public-share'
import { ShareLinkSignIn } from '@tinycld/core/components/share/ShareLinkSignIn'
import { getPublicPreviewConfig, getShareEditor } from '@tinycld/core/file-viewer/registry'
import { type ShareSession, useShareSession } from '@tinycld/core/lib/anon-identity'
import { useAuth } from '@tinycld/core/lib/auth'
import { useShareEditorMount } from '@tinycld/core/lib/editor/use-share-editor-mount'
import { useShareLinkVisitorRole } from '@tinycld/core/lib/editor/use-share-visitor-role'
import { PB_SERVER_ADDR } from '@tinycld/core/lib/pocketbase'
import { Modal, ModalBackdrop, ModalContent } from '@tinycld/core/ui/modal'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
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
    // Centralized "what role is this visitor for THIS share?" lookup. We
    // need it here to decide whether a signed-in visitor is a guest
    // (must stay on the share route) or a real member (redirect to the
    // workspace).
    const visitor = useShareLinkVisitorRole(token)

    if (auth.isInitializing || visitor.role === 'loading') {
        return <FullScreenSpinner />
    }

    // Logged-in MEMBERS with org access bypass the public preview and land
    // directly on the drive workspace with the file's preview pane open.
    // Guests (provisioned via OTP for THIS share link) must STAY on the
    // share route — they have no broader org access and the workspace
    // would 403 them everywhere else.
    if (auth.isLoggedIn && visitor.role === 'member' && data?.org_slug && data?.item_id) {
        return <Redirect href={`/a/${data.org_slug}/drive?file=${data.item_id}&preview=1`} />
    }

    if (auth.isLoggedIn && visitor.role === 'unknown' && data?.org_slug && data?.item_id) {
        // No drive_shares row but they're authed — treat as a member who
        // got here some other way and send them to the workspace.
        return <Redirect href={`/a/${data.org_slug}/drive?file=${data.item_id}&preview=1`} />
    }

    if (auth.isLoggedIn && visitor.role === 'member' && !data) {
        return <FullScreenSpinner />
    }

    // Anonymous OR guest visitor: mint a share session and render the
    // document preview (calc/text) or fall back to the generic file
    // layout. Despite the component name, AnonymousShareView is the entry
    // point for both anon AND authed-guest visitors after this change —
    // the mount hook (Part A) decides which kind of EditorMount to build.
    return <AnonymousShareView token={token} />
}

// AnonymousShareView mints the share session for the visitor (anon or
// guest) and chooses the preview surface. Calc/text links render the real
// editor (read-only for anon, role-capable for guest); everything else
// uses the generic download/preview layout.
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
    // preview) → mount the real editor for the visitor.
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

// Mounts the real calc/text editor for a share-link visitor (View 3 for
// anon, Views 4/5 for guest). For an anon commentor/editor visitor we
// also surface an inline "Sign in to {comment/edit}" CTA — tapping it
// swaps the editor body for a ShareLinkSignIn panel. On successful OTP
// verify the auth store updates, useShareEditorMount re-runs, and the
// next render produces a guest EditorMount with role-derived capabilities
// (no manual reload needed).
function AnonymousEditorView({ token, session }: { token: string; session: ShareSession }) {
    const { mount, isLoading } = useShareEditorMount(token)
    const auth = useAuth({ throwIfAnon: false })
    const entry = getShareEditor(session.mimeType)
    const ShareEditor = entry?.component

    const [signInOpen, setSignInOpen] = useState(false)

    const isAnon = !auth.isLoggedIn
    const needsAuthForRole = session.role === 'commentor' || session.role === 'editor'
    const showSignInBanner = isAnon && needsAuthForRole && !signInOpen
    const showSignInPanel = isAnon && needsAuthForRole && signInOpen
    const verb = session.role === 'editor' ? 'edit' : 'comment on'

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
                    {showSignInBanner && (
                        <View className="flex-row items-center px-4 py-2 gap-3 border-b border-border bg-muted">
                            <Text className="text-foreground flex-1" style={{ fontSize: 13 }}>
                                {`Sign in to ${verb} this document`}
                            </Text>
                            <Pressable
                                onPress={() => setSignInOpen(true)}
                                className="bg-primary px-3 py-1.5 rounded-md"
                            >
                                <Text
                                    className="text-primary-foreground"
                                    style={{ fontSize: 13, fontWeight: '600' }}
                                >
                                    Sign in
                                </Text>
                            </Pressable>
                        </View>
                    )}
                    <View className="flex-1 overflow-hidden">
                        {showSignInPanel ? (
                            <ShareLinkSignIn
                                token={token}
                                role={session.role === 'editor' ? 'editor' : 'commentor'}
                                onSuccess={() => setSignInOpen(false)}
                            />
                        ) : mount != null && ShareEditor != null ? (
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
