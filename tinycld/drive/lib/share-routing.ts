import { appHref } from '@tinycld/core/lib/org-routes'
/**
 * Where a visitor arriving on a share link should end up.
 *
 * Extracted from the route component so it can be tested directly. It could
 * not be before — the decision lived as a chain of conditions inside JSX, and
 * the conditions were wrong in a way no test noticed: they gated on an
 * `org_slug` the server stopped sending during the single-org migration, so
 * the redirect was permanently unreachable and every signed-in member fell
 * through to the anonymous public preview of a file they already had access
 * to. The redirect target was a dead `/a/<org>/` route anyway.
 */

import type { ShareLinkMetadataResponse } from '@tinycld/app-generated/drive-api'

/**
 * The slice of the share-link metadata response the routing decision reads.
 * Partial because the endpoint's error shape carries no item_id.
 */
export type ShareRoutingData = Partial<Pick<ShareLinkMetadataResponse, 'item_id'>>

export type VisitorRole = 'loading' | 'anon' | 'guest' | 'member' | 'unknown'

export type ShareRouteDecision =
    | { kind: 'wait' }
    /** Send the visitor to the workspace with the file's preview open. */
    | { kind: 'redirect'; href: string }
    /** Render the share route itself (public preview or share editor). */
    | { kind: 'share' }

/**
 * decideShareRoute answers the routing question for one visitor.
 *
 * A signed-in MEMBER bypasses the public preview and lands on the drive
 * workspace with the file's preview pane open — they have real access, so the
 * anonymous view would be a strictly worse rendering of their own file. A
 * GUEST (provisioned by OTP for this one share link) must STAY on the share
 * route: they have no broader access and the workspace would 403 them
 * everywhere else. An anonymous visitor stays too, obviously.
 */
export function decideShareRoute(args: {
    isInitializing: boolean
    isLoggedIn: boolean
    role: VisitorRole
    data: ShareRoutingData | undefined
}): ShareRouteDecision {
    const { isInitializing, isLoggedIn, role, data } = args

    if (isInitializing || role === 'loading') {
        return { kind: 'wait' }
    }

    if (!isLoggedIn) {
        return { kind: 'share' }
    }

    // 'unknown' means authed with no drive_shares row — they reached the link
    // some other way. Treat them as a member and let the workspace's own rules
    // decide what they can see; the share route would show them less.
    const goesToWorkspace = role === 'member' || role === 'unknown'
    if (!goesToWorkspace) {
        return { kind: 'share' }
    }

    // The routing data is still in flight. Waiting beats rendering the public
    // preview and then yanking it away a moment later.
    if (!data?.item_id) {
        return { kind: 'wait' }
    }

    return { kind: 'redirect', href: workspaceHref(data.item_id) }
}

/**
 * workspaceHref builds the drive URL that opens a file's preview.
 *
 * `/a` is a constant app-route segment, NOT an org slug: routes lost their org
 * segment in the single-org migration, and the router gives each org its own
 * host. Built from appHref so the prefix has one definition.
 */
export function workspaceHref(itemId: string): string {
    return `${appHref('drive')}?file=${encodeURIComponent(itemId)}&preview=1`
}
