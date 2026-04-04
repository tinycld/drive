import { Platform } from 'react-native'
import { AuthGate } from '~/components/workspace/AuthGate'
import { SkeletonLayout } from '~/components/workspace/SkeletonLayout'
import { useAuth } from '~/lib/auth'
import { navigateToOrg } from '~/lib/org-url'

export default function Index() {
    const auth = useAuth({ throwIfAnon: false })

    if (auth.isInitializing) {
        return <SkeletonLayout />
    }

    if (auth.isLoggedIn && auth.user.primaryOrgSlug) {
        if (Platform.OS === 'web') {
            navigateToOrg(auth.user.primaryOrgSlug)
            return <SkeletonLayout />
        }
    }

    return (
        <>
            <SkeletonLayout />
            <AuthGate />
        </>
    )
}
