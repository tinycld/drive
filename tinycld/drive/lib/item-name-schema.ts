import { z } from '@tinycld/core/ui/form'

// Mirrors the server's drive_items.name limit, so a name the server would
// reject never leaves the dialog.
export const ITEM_NAME_MAX_LENGTH = 500

export const itemNameSchema = z.object({
    name: z.string().trim().min(1).max(ITEM_NAME_MAX_LENGTH),
})
