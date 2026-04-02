import { Redirect } from 'one'
import { useAuth } from '~/lib/auth'
import { LoginModal } from '~/components/workspace/LoginModal'
import { SkeletonLayout } from '~/components/workspace/SkeletonLayout'

export default function Index() {
    const auth = useAuth({ throwIfAnon: false })

    if (auth.isInitializing) {
        return <SkeletonLayout />
    }

    if (auth.isLoggedIn && auth.user.primaryOrgSlug) {
        return <Redirect href={`/app/${auth.user.primaryOrgSlug}/`} />
    }

    return (
        <>
            <SkeletonLayout />
            <LoginModal />
        </>
    )
}
