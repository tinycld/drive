import type { FolderTreeNode } from '../types'
import { useDriveState } from './useDrive'

/**
 * Returns the current user's drive folder tree, suitable for feeding into
 * <ChooseFolderDialog>. Convenience wrapper around useDrive() so cross-package
 * consumers (e.g. mail's Save-to-Drive flow) can render a folder picker
 * without depending on the rest of the drive context surface.
 */
export function useFolderTree(): FolderTreeNode[] {
    const { folderTree } = useDriveState()
    return folderTree
}
