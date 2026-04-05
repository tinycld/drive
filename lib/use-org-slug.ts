import type { ReactNode } from 'react'
import { createContext, createElement, useContext, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { loadPrimaryOrgFromStorage } from '~/lib/auth'

export const OrgSlugContext = createContext<string>('')

export function OrgSlugProvider({ slug, children }: { slug: string; children: ReactNode }) {
    return createElement(OrgSlugContext.Provider, { value: slug }, children)
}

// Native: single shared AsyncStorage read, cached after first resolution
let cachedNativeSlug: string | null = null
let pendingRead: Promise<string | null> | null = null

function readNativeSlug(): Promise<string | null> {
    if (!pendingRead) {
        pendingRead = loadPrimaryOrgFromStorage().then(slug => {
            cachedNativeSlug = slug
            return slug
        })
    }
    return pendingRead
}

export function useOrgSlug(): string {
    const contextSlug = useContext(OrgSlugContext)

    // genuinely local async state — AsyncStorage has no reactive primitive
    const [slug, setSlug] = useState(cachedNativeSlug ?? '')

    useEffect(() => {
        if (Platform.OS === 'web' || cachedNativeSlug != null) return
        readNativeSlug().then(s => {
            if (s) setSlug(s)
        })
    }, [])

    if (Platform.OS === 'web') return contextSlug
    return contextSlug || slug
}
