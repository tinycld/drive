import type { Href } from 'expo-router'
import { useRouter } from 'expo-router'
import { useDriveUIStore } from '../stores/drive-ui-store'
import type { DriveItemView, SidebarSection } from '../types'

const SECTION_SLUGS: Record<string, SidebarSection> = {
    trash: 'trash',
    starred: 'starred',
    recent: 'recent',
    shared: 'shared-with-me',
}

export function parseDrivePath(pathname: string): { section: SidebarSection; folderId: string } {
    const driveIdx = pathname.indexOf('/drive')
    if (driveIdx === -1) return { section: 'my-drive', folderId: '' }
    const rest = pathname.slice(driveIdx + '/drive'.length)
    const segments = rest.split('/').filter(Boolean)

    if (segments[0] === 'folder' && segments[1]) {
        return { section: 'my-drive', folderId: segments[1] }
    }
    const section = SECTION_SLUGS[segments[0] ?? '']
    if (section) return { section, folderId: '' }
    return { section: 'my-drive', folderId: '' }
}

interface UseDriveNavigationParams {
    clearSearch: () => void
    clearSelection: () => void
}

/**
 * Bare `/drive`, not `/a/<orgSlug>/drive`: routes lost their org segment in the
 * single-org migration, and the router now gives each org its own host. An
 * org-prefixed href resolves to +not-found — see workspaceHref in
 * lib/share-routing.ts, which carries the same note.
 */
const driveBase = '/drive'

export function buildDriveHref(opts?: { section?: SidebarSection; folderId?: string }): Href {
    if (opts?.folderId) return `${driveBase}/folder/${opts.folderId}` as Href
    if (opts?.section && opts.section !== 'my-drive') {
        const slug = opts.section === 'shared-with-me' ? 'shared' : opts.section
        return `${driveBase}/${slug}` as Href
    }
    return driveBase as Href
}

export function useDriveNavigation({ clearSearch, clearSelection }: UseDriveNavigationParams) {
    const router = useRouter()

    // Preview state lives in the Zustand store, not the URL. Earlier this
    // used router.push to set ?file=X&preview=1, which made Expo Router's
    // <Slot/> remount the screen, blowing away FlashList scroll position
    // every time the modal opened or closed.
    const openPreviewItem = useDriveUIStore(s => s.openPreviewItem)
    const closePreviewItem = useDriveUIStore(s => s.closePreviewItem)
    const openPreview = (item: DriveItemView) => {
        if (!item.isFolder) openPreviewItem(item.id)
    }
    const closePreview = () => {
        closePreviewItem()
    }

    const navigateToFolder = (folderId: string) => {
        router.push(buildDriveHref({ folderId: folderId || undefined }))
        clearSearch()
        clearSelection()
    }

    // Going "up" is a pop, not a push: when the user reached this folder by
    // tapping into it, router.back() pops the stack and plays the native
    // slide-out animation. Pushing the parent href instead (as navigateToFolder
    // does) animates as a forward slide-in — wrong direction for a back action.
    // Falls back to a push when there's no history to pop (deep link, refresh).
    const navigateBack = (parentId: string) => {
        if (router.canGoBack()) {
            router.back()
        } else {
            router.replace(buildDriveHref({ folderId: parentId || undefined }))
        }
        clearSearch()
        clearSelection()
    }

    const navigateToSection = (section: SidebarSection) => {
        router.push(buildDriveHref({ section }))
        clearSearch()
        clearSelection()
    }

    // Only ever reached for folders now: the context menu's "Open" row is
    // gated to folders, and file opening goes through useOpenDriveItem's
    // openFile (app opener or preview). Kept folder-shaped for the menu's
    // folder navigation; the file branch would be dead, so it's gone.
    const openItem = (item: DriveItemView) => {
        if (item.isFolder) navigateToFolder(item.id)
    }

    return {
        navigateToFolder,
        navigateBack,
        navigateToSection,
        openItem,
        openPreview,
        closePreview,
    }
}
