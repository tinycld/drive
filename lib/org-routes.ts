import type { OneRouter } from 'one'
import { useOrgSlug } from '~/lib/use-org-slug'

type AllRoutes = OneRouter.__routes['StaticRoutes'] | OneRouter.DynamicRouteTemplate
type FullOrgRoute = AllRoutes & `/a/[orgSlug]${string}`

// Strip the /a/[orgSlug] prefix to get the short form callers use
type StripOrgPrefix<T> = T extends `/a/[orgSlug]/${infer Rest}`
    ? Rest
    : T extends '/a/[orgSlug]'
      ? ''
      : never
type OrgPath = StripOrgPrefix<FullOrgRoute>

// Reconstruct the full route from a short path
type ToFullRoute<P extends string> = P extends '' ? '/a/[orgSlug]' : `/a/[orgSlug]/${P}`

type QueryParams = Record<string, string | number | string[]>

/**
 * Hook for type-safe org-scoped navigation.
 * Returns a function that builds href objects from short paths (without /a/[orgSlug] prefix).
 *
 * Usage:
 *   const orgHref = useOrgHref()
 *   router.push(orgHref('contacts/new'))
 *   router.push(orgHref('contacts/[id]', { id: '123' }))
 *   router.push(orgHref('mail', { folder: 'sent' }))
 *   router.push(orgHref('settings/[...section]', { section: ['mail', 'provider'] }))
 *   <Link href={orgHref('mail/[id]', { id: threadId })} />
 *
 * The short path is validated against known routes — misspellings are caught at compile time.
 */
export function useOrgHref() {
    const orgSlug = useOrgSlug()
    return <P extends OrgPath>(
        path: P,
        extra?: Omit<OneRouter.InputRouteParams<ToFullRoute<P>>, 'orgSlug'> & QueryParams
    ): {
        pathname: ToFullRoute<P>
        params: OneRouter.InputRouteParams<ToFullRoute<P>> & QueryParams
    } => {
        const pathname = (path === '' ? '/a/[orgSlug]' : `/a/[orgSlug]/${path}`) as ToFullRoute<P>
        return {
            pathname,
            params: { orgSlug, ...extra } as OneRouter.InputRouteParams<ToFullRoute<P>> &
                QueryParams,
        }
    }
}
