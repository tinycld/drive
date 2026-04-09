import { useLiveQuery } from '@tanstack/react-db'
import { Star } from 'lucide-react-native'
import { Link } from 'one'
import { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Input, SizableText, useTheme, XStack, YStack } from 'tamagui'
import { DataTableHeader } from '~/components/DataTableHeader'
import { EmptyState } from '~/components/EmptyState'
import { useMutation } from '~/lib/mutations'
import { useOrgHref } from '~/lib/org-routes'
import { useStore } from '~/lib/pocketbase'
import { ContactAvatar } from '../components/ContactAvatar'
import { useContactSearch } from '../hooks/useContactSearch'

const CONTACT_COLUMNS = [
    { label: 'Name', flex: 2 },
    { label: 'Email', flex: 2 },
    { label: 'Phone', flex: 1 },
]

export default function ContactListScreen() {
    const [contactsCollection] = useStore('contacts')
    const [searchQuery, setSearchQuery] = useState('')
    const orgHref = useOrgHref()
    const newContactHref = orgHref('contacts/new')

    const { data: contacts, isLoading } = useLiveQuery(query =>
        query
            .from({ contacts: contactsCollection })
            .orderBy(({ contacts }) => contacts.first_name, 'asc')
    )

    const toggleFavorite = useMutation({
        mutationFn: function* ({ id, currentFavorite }: { id: string; currentFavorite: boolean }) {
            yield contactsCollection.update(id, draft => {
                draft.favorite = !currentFavorite
            })
        },
    })

    const useServerSearch = searchQuery.length >= 2
    const { results: serverResults } = useContactSearch(useServerSearch ? searchQuery : '')

    const filteredContacts = useMemo(() => {
        if (useServerSearch) return serverResults

        const q = searchQuery.toLowerCase()
        if (!q) return contacts ?? []

        return (contacts ?? []).filter(c => {
            const fullName = `${c.first_name} ${c.last_name}`.toLowerCase()
            return (
                fullName.includes(q) ||
                c.email?.toLowerCase().includes(q) ||
                c.company?.toLowerCase().includes(q)
            )
        })
    }, [useServerSearch, serverResults, searchQuery, contacts])

    const count = filteredContacts?.length ?? 0

    if (isLoading) {
        return (
            <YStack flex={1} padding="$5" backgroundColor="$background">
                <SizableText size="$4" color="$color8">
                    Loading contacts...
                </SizableText>
            </YStack>
        )
    }

    const isEmpty = !contacts || contacts.length === 0

    if (isEmpty) {
        return (
            <EmptyState
                message="No contacts yet."
                action={{ label: '+ Add Contact', href: newContactHref }}
            />
        )
    }

    return (
        <YStack flex={1} padding="$5" backgroundColor="$background">
            <XStack justifyContent="space-between" alignItems="center" marginBottom="$4">
                <SizableText size="$7" fontWeight="bold" color="$color">
                    Contacts ({count})
                </SizableText>
                <Input
                    size="$3"
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    width={250}
                    backgroundColor="$background"
                    borderColor="$borderColor"
                    placeholderTextColor="$placeholderColor"
                    color="$color"
                />
            </XStack>

            <DataTableHeader columns={CONTACT_COLUMNS} trailing={<View style={{ width: 32 }} />} />

            <YStack>
                {filteredContacts?.map(contact => (
                    <ContactRow
                        key={contact.id}
                        contact={contact}
                        onToggleFavorite={() =>
                            toggleFavorite.mutate({
                                id: contact.id,
                                currentFavorite: contact.favorite,
                            })
                        }
                    />
                ))}
            </YStack>
        </YStack>
    )
}

interface ContactRowProps {
    contact: {
        id: string
        first_name: string
        last_name: string
        email: string
        phone: string
        favorite: boolean
    }
    onToggleFavorite: () => void
}

function ContactRow({ contact, onToggleFavorite }: ContactRowProps) {
    const theme = useTheme()
    const orgHref = useOrgHref()
    const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')

    return (
        <Link href={orgHref('contacts/[id]', { id: contact.id })}>
            <XStack
                paddingHorizontal="$3"
                paddingVertical="$3"
                alignItems="center"
                borderBottomWidth={1}
                borderBottomColor="$borderColor"
                hoverStyle={{ backgroundColor: '$backgroundHover' }}
            >
                <XStack flex={2} alignItems="center" gap="$3">
                    <ContactAvatar firstName={contact.first_name} lastName={contact.last_name} />
                    <SizableText size="$4" color="$color" fontWeight="500" numberOfLines={1}>
                        {displayName}
                    </SizableText>
                </XStack>
                <SizableText size="$3" color="$color8" flex={2} numberOfLines={1}>
                    {contact.email}
                </SizableText>
                <SizableText size="$3" color="$color8" flex={1} numberOfLines={1}>
                    {contact.phone}
                </SizableText>
                <Pressable
                    onPress={e => {
                        e.stopPropagation()
                        onToggleFavorite()
                    }}
                >
                    <Star
                        size={18}
                        color={contact.favorite ? theme.yellow8.val : theme.color8.val}
                        fill={contact.favorite ? theme.yellow8.val : 'transparent'}
                    />
                </Pressable>
            </XStack>
        </Link>
    )
}
