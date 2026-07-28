import { useQuery } from '@tanstack/react-query'
import {
    PublicShareError,
    PublicShareLayout,
    type PublicShareMetadata,
} from '@tinycld/core/components/public-share'
import { ShareLinkSignIn } from '@tinycld/core/components/share/ShareLinkSignIn'
import { PackageProviderWrapper } from '@tinycld/core/components/workspace/PackageProviderWrapper'
import { getShareEditor } from '@tinycld/core/file-viewer/registry'
import { type ShareSession, useShareSession } from '@tinycld/core/lib/anon-identity'
import { useAuth } from '@tinycld/core/lib/auth'
import { useShareEditorMount } from '@tinycld/core/lib/editor/use-share-editor-mount'
import { useShareLinkVisitorRole } from '@tinycld/core/lib/editor/use-share-visitor-role'
import { PB_SERVER_ADDR } from '@tinycld/core/lib/pocketbase'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { Suspense, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { decideShareRoute, type ShareRoutingData } from '../../lib/share-routing'

const shareLinkUrl = (token: string) => `${PB_SERVER_ADDR}/api/drive/share-link/${token}`

function useShareLinkRouting(token: string) {
    const auth = useAuth({ throwIfAnon: false })

    const query = useQuery<ShareRoutingData>({
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

    const route = decideShareRoute({
        isInitializing: auth.isInitializing,
        isLoggedIn: auth.isLoggedIn,
        role: visitor.role,
        data,
    })

    if (route.kind === 'wait') {
        return <FullScreenSpinner />
    }
    if (route.kind === 'redirect') {
        return <Redirect href={route.href} />
    }

    // Anonymous OR guest visitor: mint a share session and render the
    // document preview or fall back to the generic file layout. The
    // mount hook decides which kind of EditorMount to build based on the
    // visitor's role.
    //
    // PackageProviderWrapper mounts every installed package's provider
    // — each provider's lazy chunk side-effect-registers its share
    // editor with the registry on first load. Without this wrapper the
    // share-editor registry is empty on the public share route (no
    // package code has run yet outside the workspace), so
    // getShareEditor() returns undefined and the route falls through
    // to the static PublicShareLayout dialog instead of mounting the
    // real editor.
    return (
        <PackageProviderWrapper>
            <ShareView token={token} />
        </PackageProviderWrapper>
    )
}

// ShareView mints the share session for the visitor (anon or guest) and
// chooses the preview surface. Calc/text links render the real editor
// (read-only for anon, role-capable for guest); everything else uses the
// generic download/preview layout.
function ShareView({ token }: { token: string }) {
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
    //
    // No OrgSlugProvider wrapper: single-org has no slug to provide, the
    // provider is a no-op shim that ignores the prop, and the session no
    // longer carries one.
    if (getShareEditor(session.mimeType)) {
        return <ShareEditorView token={token} session={session} />
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
function ShareEditorView({ token, session }: { token: string; session: ShareSession }) {
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
    const showEditorAnonHint = isAnon && session.role === 'editor'

    const subtitle = session.orgName
        ? showEditorAnonHint
            ? `Shared from ${session.orgName} · sign in to edit · viewing as ${session.displayName}`
            : `Shared from ${session.orgName} · viewing as ${session.displayName}`
        : showEditorAnonHint
          ? `Sign in to edit · viewing as ${session.displayName}`
          : `Viewing as ${session.displayName}`

    // Full-screen layout: anon/guest share pages live at /p/drive/share/[token],
    // outside the org-scoped app shell — there's no PackagesRail or workspace
    // nav to overlay, so the editor should fill the viewport directly rather
    // than sit inside a Modal that would only add a backdrop + boxed frame.
    return (
        <View className="flex-1 bg-background">
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
                    // The registered ShareEditor is a React.lazy component
                    // (text/calc providers defer their screen tree to avoid
                    // closing a require cycle through pocketbase). A
                    // Suspense boundary here lets the editor chunk load
                    // without crashing the share route.
                    <Suspense fallback={<FullScreenSpinner />}>
                        <ShareEditor mount={mount} />
                    </Suspense>
                ) : isLoading ? (
                    <FullScreenSpinner />
                ) : (
                    <View className="flex-1 items-center justify-center px-6">
                        <Text
                            className="text-muted-foreground text-center"
                            style={{ fontSize: 14 }}
                        >
                            Preview unavailable for this file.
                        </Text>
                    </View>
                )}
            </View>
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
