import { useLocalSearchParams } from 'expo-router'
import { VersionHistoryScreen } from '../../components/version-history/VersionHistoryScreen'

export default function VersionHistoryRoute() {
    const { itemId } = useLocalSearchParams<{ itemId: string }>()
    return <VersionHistoryScreen itemId={itemId} />
}
