import { useShareData } from '../hooks/use-share-data'
import { ShareDialog } from './ShareDialog'

interface ShareDialogConnectedProps {
    open: boolean
    itemId: string
    itemName: string
    onClose: () => void
}

/**
 * Self-contained Share dialog: loads its own org members, existing shares,
 * and remove-share mutation. Drop-in for any surface that has an item id and
 * wants to open the share UI — used by Drive's own toolbar/context-menu and
 * by the text/calc File menus, which don't have access to `useDrive()`.
 */
export function ShareDialogConnected({
    open,
    itemId,
    itemName,
    onClose,
}: ShareDialogConnectedProps) {
    const { shares, orgMembers, currentUserOrgId, removeShare } = useShareData(itemId)

    return (
        <ShareDialog
            open={open}
            itemId={itemId}
            itemName={itemName}
            shares={shares}
            orgMembers={orgMembers}
            currentUserOrgId={currentUserOrgId}
            onRemoveShare={removeShare}
            onClose={onClose}
        />
    )
}

// Default export so packages that need to break a module-init cycle (the
// text + calc File menus, whose screen tree is loaded during tinycld.config.ts
// init) can lazy-load this component without a re-export wrapper.
export default ShareDialogConnected
