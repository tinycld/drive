import { appHref } from '@tinycld/core/lib/org-routes'
import type { Href } from 'expo-router'

// The history route of the package the user is in. Drive mounts it at
// /a/drive/history/<id>; a package that edits files (text, calc) mounts the
// same VersionHistoryScreen under its own slug, so opening history from the
// editor keeps the user in that package.
export function versionHistoryHref(itemId: string, packageSlug = 'drive'): Href {
    return `${appHref(packageSlug)}/history/${itemId}` as Href
}
