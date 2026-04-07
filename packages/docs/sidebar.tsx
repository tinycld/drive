import { PenLine, Plus } from 'lucide-react-native'
import { useRouter } from 'one'
import {
    SidebarActionButton,
    SidebarDivider,
    SidebarItem,
    SidebarNav,
} from '~/components/sidebar-primitives'
import { useOrgHref } from '~/lib/org-routes'

interface DocumentsSidebarProps {
    isCollapsed: boolean
}

export default function DocumentsSidebar(_props: DocumentsSidebarProps) {
    const router = useRouter()
    const orgHref = useOrgHref()

    return (
        <SidebarNav>
            <SidebarActionButton
                label="New document"
                icon={Plus}
                onPress={() => router.push(orgHref('docs/new'))}
            />

            <SidebarDivider />

            <SidebarItem
                label="All documents"
                icon={PenLine}
                isActive
                onPress={() => router.push(orgHref('docs'))}
            />
        </SidebarNav>
    )
}
