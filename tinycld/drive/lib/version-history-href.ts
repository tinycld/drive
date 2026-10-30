import { appHref } from '@tinycld/core/lib/org-routes'
import type { Href } from 'expo-router'

export function versionHistoryHref(itemId: string): Href {
    return `${appHref('drive')}/history/${itemId}` as Href
}
