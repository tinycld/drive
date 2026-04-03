import { Home } from 'lucide-react-native'
import { type Href, useRouter } from 'one'
import { SidebarItem, SidebarNav } from '~/components/sidebar-primitives'

interface AddonSidebarFallbackProps {
    addonLabel: string
    basePath: string
}

export function AddonSidebarFallback({ addonLabel, basePath }: AddonSidebarFallbackProps) {
    const router = useRouter()

    return (
        <SidebarNav>
            <SidebarItem
                label={addonLabel}
                icon={Home}
                isActive
                onPress={() => router.push(basePath as Href)}
            />
        </SidebarNav>
    )
}
