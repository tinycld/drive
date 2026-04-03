import { Redirect } from 'one'
import { LoginModal } from '~/components/workspace/LoginModal'
import { SkeletonLayout } from '~/components/workspace/SkeletonLayout'
import { useAuth } from '~/lib/auth'

export default function Index() {
    const auth = useAuth({ throwIfAnon: false })

    if (auth.isInitializing) {
        return <SkeletonLayout />
    }

    if (auth.isLoggedIn && auth.user.primaryOrgSlug) {
        return (
            <Redirect
                href={{
                    pathname: '/app/[orgSlug]',
                    params: { orgSlug: auth.user.primaryOrgSlug },
                }}
            />
        )
    }

    return (
        <>
            <SkeletonLayout />
            <LoginModal />
        </>
    )
}
