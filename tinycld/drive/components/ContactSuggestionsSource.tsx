import { eq } from '@tanstack/db'
import { useEffect } from 'react'
import { usePackages } from '@tinycld/core/lib/packages/use-packages'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useOrgLiveQuery } from '@tinycld/core/lib/use-org-live-query'

export interface ContactSuggestion {
    id: string
    first_name: string
    last_name: string
    email: string
}

interface ContactSuggestionsSourceProps {
    onChange: (contacts: ContactSuggestion[]) => void
}

// Headless component: only mounted when the contacts package is linked.
// Subscribes to the contacts collection and reports the list up via a
// callback. Isolating the useStore('contacts') call here keeps
// ShareDialog renderable when contacts isn't linked (useStore throws
// on unknown collection keys).
function ContactSuggestionsBridge({ onChange }: ContactSuggestionsSourceProps) {
    // biome-ignore lint/suspicious/noExplicitAny: cross-package soft dependency
    const [contactsCollection] = useStore('contacts' as any) as [any]

    const { data } = useOrgLiveQuery(
        (query, { userOrgId }) =>
            query
                .from({ contacts: contactsCollection })
                // biome-ignore lint/suspicious/noExplicitAny: collection is dynamic
                .where(({ contacts }: any) => eq(contacts.owner, userOrgId))
                // biome-ignore lint/suspicious/noExplicitAny: collection is dynamic
                .orderBy(({ contacts }: any) => contacts.first_name, 'asc'),
        []
    )

    useEffect(() => {
        onChange((data as ContactSuggestion[] | undefined) ?? [])
    }, [data, onChange])

    return null
}

// Runtime gate: checks the runtime package registry. When contacts
// isn't installed we skip the subscription entirely.
export function ContactSuggestionsSource(props: ContactSuggestionsSourceProps) {
    const packages = usePackages()
    const contactsInstalled = packages.some((p) => p.slug === 'contacts')
    if (!contactsInstalled) return null
    return <ContactSuggestionsBridge {...props} />
}
