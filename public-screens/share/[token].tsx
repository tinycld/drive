import { useQuery } from '@tanstack/react-query'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '~/lib/auth'
import { PB_SERVER_ADDR } from '~/lib/pocketbase'
import { PublicSharePage } from '../../components/PublicSharePage'

function useShareLinkRouting(token: string) {
    const auth = useAuth({ throwIfAnon: false })

    const query = useQuery<{ org_slug: string; item_id: string }>({
        queryKey: ['share-link-routing', token],
        queryFn: async () => {
            const resp = await fetch(`${PB_SERVER_ADDR}/api/drive/share-link/${token}`)
            if (!resp.ok) throw new Error('Failed to load share link')
            return resp.json()
        },
        enabled: !!token && auth.isLoggedIn && !auth.isInitializing,
    })

    return { ...query, auth }
}

export default function ShareTokenPage() {
    const { token = '' } = useLocalSearchParams<{ token: string }>()
    const { data, auth } = useShareLinkRouting(token)

    if (auth.isInitializing) {
        return (
            <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" />
            </View>
        )
    }

    if (auth.isLoggedIn && data?.org_slug && data?.item_id) {
        return <Redirect href={`/a/${data.org_slug}/drive?file=${data.item_id}&preview=1`} />
    }

    if (auth.isLoggedIn && !data) {
        return (
            <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" />
            </View>
        )
    }

    return <PublicSharePage token={token} />
}
