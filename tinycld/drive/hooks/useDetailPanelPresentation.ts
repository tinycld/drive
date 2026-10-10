import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import type { DrawerPresentation } from '@tinycld/core/ui/drawer'

/** The detail panel sits beside the listing where there is room for both, and
 *  over it on narrower screens. Beside the listing it is not modal, so a single
 *  click on an item can open it without blocking the listing. */
export function useDetailPanelPresentation(): DrawerPresentation {
    return useBreakpoint() === 'desktop' ? 'inline' : 'overlay'
}
