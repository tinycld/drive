import { Home } from 'lucide-react-native'
import { useRouter } from 'one'
import { SidebarItem, SidebarNav } from '~/components/sidebar-primitives'
import { useOrgSlug } from '~/lib/use-org-slug'

interface AddonSidebarFallbackProps {
    addonSlug: string
    addonLabel: string
}

export function AddonSidebarFallback({ addonSlug, addonLabel }: AddonSidebarFallbackProps) {
    const router = useRouter()
    const orgSlug = useOrgSlug()

    return (
        <SidebarNav>
            <SidebarItem
                label={addonLabel}
                icon={Home}
                isActive
                onPress={() => router.push(`/a/${orgSlug}/${addonSlug}`)}
            />
        </SidebarNav>
    )
}
