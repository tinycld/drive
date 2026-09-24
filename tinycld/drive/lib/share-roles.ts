import type { GroupRoleOption } from '@tinycld/core/lib/groups/types'
import type { DriveShareRole } from '../types'

// A group is never an owner: driveshare treats an owner share as delete
// rights, and ownership of a file stays with a person.
export const GROUP_ROLE_OPTIONS: readonly GroupRoleOption<DriveShareRole>[] = [
    { value: 'editor', label: 'Editor' },
    { value: 'commentor', label: 'Commentor' },
    { value: 'viewer', label: 'Viewer' },
]
