import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
    CreateShareLinkRequest,
    ShareLinkEntry,
    ShareLinkListResponse,
    ShareLinkResponse,
    ShareRequest,
} from '@tinycld/app-generated/drive-api'
import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { NameAvatar } from '@tinycld/core/components/NameAvatar'
import {
    type ContactSuggestion,
    ContactSuggestionsProvider,
} from '@tinycld/core/lib/contacts/use-contact-suggestions'
import { captureException, errorToString } from '@tinycld/core/lib/errors'
import { usePackages } from '@tinycld/core/lib/packages/use-packages'
import { pb } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { Modal, ModalBackdrop, ModalContent } from '@tinycld/core/ui/modal'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { Check, ChevronDown, Globe, Link, Lock, Trash2, X } from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native'

// One merged, de-duplicated suggestion the picker can render, tagged by where
// it came from (an org member vs. a contact from the optional contacts pkg).
interface SuggestionEntry {
    key: string
    userId: string
    name: string
    email: string
    source: 'member' | 'contact'
}

interface OrgMember {
    userId: string
    name: string
    email: string
}

interface ShareEntry {
    id: string
    userId: string
    name: string
    email: string
    role: string
}

interface PendingShare {
    key: string
    userId: string
    name: string
    email: string
    role: 'editor' | 'viewer'
}

interface ShareDialogProps {
    open: boolean
    itemId: string
    itemName: string
    shares: ShareEntry[]
    orgMembers: OrgMember[]
    currentUserId: string
    onRemoveShare: (shareId: string) => void
    onClose: () => void
}

const webShadow =
    Platform.OS === 'web'
        ? ({ boxShadow: '0 4px 16px rgba(0,0,0,0.18)' } as Record<string, unknown>)
        : {}

export function ShareDialog({
    open,
    itemId,
    itemName,
    shares,
    orgMembers,
    currentUserId,
    onRemoveShare,
    onClose,
}: ShareDialogProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const primaryColor = useThemeColor('primary')
    const [search, setSearch] = useState('')
    const [defaultRole, setDefaultRole] = useState<'editor' | 'viewer'>('editor')
    const [pending, setPending] = useState<PendingShare[]>([])
    const [linkCopied, setLinkCopied] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [isCreatingPublicLink, setIsCreatingPublicLink] = useState(false)
    const queryClient = useQueryClient()

    const { data: shareLinksData } = useQuery<ShareLinkListResponse>({
        queryKey: ['share-links', itemId],
        queryFn: async () => {
            const resp = await pb.send(`/api/drive/share-links?item_id=${itemId}`, {
                method: 'GET',
            })
            return resp
        },
        enabled: open && !!itemId,
    })

    const activeShareLink = shareLinksData?.links?.find(l => l.is_active)

    const publicShareUrl = activeShareLink
        ? `${window.location.origin}/p/drive/share/${activeShareLink.token}`
        : ''

    const copyLink = useCallback(async () => {
        if (Platform.OS !== 'web') return
        let url = publicShareUrl
        if (!url) {
            try {
                setIsCreatingPublicLink(true)
                const resp: ShareLinkResponse = await pb.send('/api/drive/share-link', {
                    method: 'POST',
                    body: { item_id: itemId, role: 'viewer' } satisfies CreateShareLinkRequest,
                })
                url = `${window.location.origin}/p/drive/share/${resp.token}`
                queryClient.invalidateQueries({ queryKey: ['share-links', itemId] })
            } catch (err) {
                captureException('share-link', err)
                return
            } finally {
                setIsCreatingPublicLink(false)
            }
        }
        navigator.clipboard.writeText(url)
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2000)
    }, [publicShareUrl, itemId, queryClient])

    const alreadySharedIds = useMemo(() => new Set(shares.map(s => s.userId)), [shares])
    const pendingEmails = useMemo(() => new Set(pending.map(p => p.email.toLowerCase())), [pending])

    const handleSelect = (s: SuggestionEntry) => {
        setPending(prev => [
            ...prev,
            {
                key: s.key,
                userId: s.userId,
                name: s.name,
                email: s.email,
                role: defaultRole,
            },
        ])
        setSearch('')
    }

    const removePending = (key: string) => {
        setPending(prev => prev.filter(p => p.key !== key))
    }

    const setPendingRole = (key: string, role: 'editor' | 'viewer') => {
        setPending(prev => prev.map(p => (p.key === key ? { ...p, role } : p)))
    }

    const handleDone = async () => {
        if (pending.length > 0) {
            setIsSaving(true)
            try {
                await pb.send('/api/drive/share', {
                    method: 'POST',
                    body: {
                        item_id: itemId,
                        recipients: pending.map(p => ({
                            user_id: p.userId || undefined,
                            email: p.email,
                            name: p.name,
                            role: p.role,
                        })),
                    } satisfies ShareRequest,
                })
            } catch (err) {
                // Closing here would report a success the user didn't get —
                // people they believe they shared with would silently have no
                // access. Keep the dialog open with the pending list intact
                // so Done can be retried, and say what happened.
                captureException('drive.share.save', err, {
                    itemId,
                    recipients: pending.length,
                })
                setSaveError(errorToString(err))
                setIsSaving(false)
                return
            }
            setIsSaving(false)
        }
        setPending([])
        setSearch('')
        setSaveError(null)
        onClose()
    }

    const currentUserShare = shares.find(s => s.userId === currentUserId)
    const otherShares = shares.filter(s => s.userId !== currentUserId)

    return (
        <Modal isOpen={open} onClose={onClose}>
            <ModalBackdrop />
            <ModalContent
                className="w-[min(540px,92vw)] p-0 rounded-2xl overflow-hidden"
                style={{ maxHeight: '90vh' } as object}
            >
                <View className="px-6 pb-4 flex-row items-center gap-2" style={{ paddingTop: 28 }}>
                    <Text
                        className="text-foreground flex-1"
                        style={{ fontSize: 28 }}
                        numberOfLines={1}
                    >
                        Share &ldquo;{itemName}&rdquo;
                    </Text>
                    <HelpIcon topic="drive:sharing" size={20} />
                    <Pressable
                        onPress={onClose}
                        accessibilityLabel="Close share dialog"
                        accessibilityRole="button"
                        hitSlop={8}
                        className="rounded-full p-1"
                    >
                        <X size={20} color={mutedColor} />
                    </Pressable>
                </View>

                {/* Search row stays pinned above the scrollable body so the suggestions
                    dropdown (position: absolute) anchors to the input even when the
                    body scrolls underneath. */}
                <View className="px-6 pb-5 relative overflow-visible" style={{ zIndex: 100 }}>
                    <View
                        className="flex-row items-center gap-2 rounded-lg"
                        style={{
                            borderWidth: 2,
                            paddingHorizontal: 14,
                            paddingVertical: 14,
                            borderColor: primaryColor,
                        }}
                    >
                        <PlainInput
                            value={search}
                            onChangeText={setSearch}
                            placeholder="Add people by name or email"
                            placeholderTextColor={primaryColor}
                            className="flex-1 text-foreground"
                            style={{ fontSize: 15 }}
                            autoFocus
                        />
                        <RolePicker value={defaultRole} onChange={setDefaultRole} />
                    </View>

                    <SuggestionsDropdown
                        search={search}
                        orgMembers={orgMembers}
                        alreadySharedIds={alreadySharedIds}
                        pendingEmails={pendingEmails}
                        currentUserId={currentUserId}
                        onSelect={handleSelect}
                    />
                </View>

                {/* Scrollable middle: collapses before the bottom action bar so
                    long pending/people/general-access lists never push the
                    Done button below the modal's max-height. */}
                <ScrollView
                    style={{ flexShrink: 1 }}
                    contentContainerStyle={{ flexGrow: 0 }}
                    keyboardShouldPersistTaps="handled"
                >
                    {pending.length > 0 && (
                        <View className="px-6 pb-4">
                            {pending.map(p => (
                                <View
                                    key={p.key}
                                    className="flex-row items-center gap-3"
                                    style={{ paddingVertical: 6 }}
                                >
                                    <NameAvatar firstName={p.name || p.email} size={36} />
                                    <View className="flex-1" style={{ gap: 1 }}>
                                        <Text
                                            numberOfLines={1}
                                            className="text-foreground"
                                            style={{
                                                fontSize: 13,
                                                fontWeight: '500',
                                            }}
                                        >
                                            {p.name || p.email}
                                        </Text>
                                        <Text
                                            numberOfLines={1}
                                            className="text-muted-foreground"
                                            style={{ fontSize: 12 }}
                                        >
                                            {p.email}
                                        </Text>
                                    </View>
                                    <RolePicker
                                        value={p.role}
                                        onChange={role => setPendingRole(p.key, role)}
                                    />
                                    <Pressable
                                        onPress={() => removePending(p.key)}
                                        className="p-1.5"
                                    >
                                        <Trash2 size={14} color={mutedColor} />
                                    </Pressable>
                                </View>
                            ))}
                        </View>
                    )}

                    <View className="px-6 pb-4">
                        <Text
                            className="mb-3 text-foreground"
                            style={{
                                fontSize: 16,
                                fontWeight: '600',
                            }}
                        >
                            People with access
                        </Text>

                        {currentUserShare && (
                            <View
                                className="flex-row items-center gap-3"
                                style={{ paddingVertical: 6 }}
                            >
                                <NameAvatar
                                    firstName={currentUserShare.name || currentUserShare.email}
                                    size={36}
                                />
                                <View className="flex-1" style={{ gap: 1 }}>
                                    <Text
                                        className="text-foreground"
                                        style={{
                                            fontSize: 13,
                                            fontWeight: '500',
                                        }}
                                    >
                                        {currentUserShare.name || currentUserShare.email} (you)
                                    </Text>
                                    <Text
                                        className="text-muted-foreground"
                                        style={{ fontSize: 12 }}
                                    >
                                        {currentUserShare.email}
                                    </Text>
                                </View>
                                <Text
                                    className="text-muted-foreground"
                                    style={{
                                        fontSize: 12,
                                        textTransform: 'capitalize',
                                    }}
                                >
                                    Owner
                                </Text>
                            </View>
                        )}

                        {otherShares.map(share => (
                            <View
                                key={share.id}
                                className="flex-row items-center gap-3"
                                style={{ paddingVertical: 6 }}
                            >
                                <NameAvatar firstName={share.name || share.email} size={36} />
                                <View className="flex-1" style={{ gap: 1 }}>
                                    <Text
                                        numberOfLines={1}
                                        className="text-foreground"
                                        style={{
                                            fontSize: 13,
                                            fontWeight: '500',
                                        }}
                                    >
                                        {share.name || share.email}
                                    </Text>
                                    <Text
                                        numberOfLines={1}
                                        className="text-muted-foreground"
                                        style={{ fontSize: 12 }}
                                    >
                                        {share.email}
                                    </Text>
                                </View>
                                <Text
                                    className="text-muted-foreground"
                                    style={{
                                        fontSize: 12,
                                        textTransform: 'capitalize',
                                    }}
                                >
                                    {share.role}
                                </Text>
                                <Pressable
                                    onPress={() => onRemoveShare(share.id)}
                                    className="p-1.5"
                                >
                                    <Trash2 size={14} color={mutedColor} />
                                </Pressable>
                            </View>
                        ))}
                    </View>

                    <View className="px-6 pb-4">
                        <Text
                            className="mb-3 text-foreground"
                            style={{
                                fontSize: 16,
                                fontWeight: '600',
                            }}
                        >
                            General access
                        </Text>
                        <GeneralAccessSection
                            activeShareLink={activeShareLink}
                            isCreatingPublicLink={isCreatingPublicLink}
                            onTogglePublicLink={async () => {
                                if (activeShareLink) {
                                    try {
                                        await pb.send(
                                            `/api/drive/share-link/${activeShareLink.id}`,
                                            {
                                                method: 'DELETE',
                                            }
                                        )
                                        queryClient.invalidateQueries({
                                            queryKey: ['share-links', itemId],
                                        })
                                    } catch (err) {
                                        captureException('share-link', err)
                                    }
                                } else {
                                    setIsCreatingPublicLink(true)
                                    try {
                                        await pb.send('/api/drive/share-link', {
                                            method: 'POST',
                                            body: {
                                                item_id: itemId,
                                                role: 'viewer',
                                            } satisfies CreateShareLinkRequest,
                                        })
                                        queryClient.invalidateQueries({
                                            queryKey: ['share-links', itemId],
                                        })
                                    } catch (err) {
                                        captureException('share-link', err)
                                    } finally {
                                        setIsCreatingPublicLink(false)
                                    }
                                }
                            }}
                            onCopyPublicLink={() => {
                                if (Platform.OS === 'web' && publicShareUrl) {
                                    navigator.clipboard.writeText(publicShareUrl)
                                    setLinkCopied(true)
                                    setTimeout(() => setLinkCopied(false), 2000)
                                }
                            }}
                            linkCopied={linkCopied}
                        />
                    </View>
                </ScrollView>

                <SaveErrorBanner message={saveError} />

                <View className="flex-row items-center justify-between px-6 py-4 border-t border-border">
                    <Pressable
                        className="flex-row items-center gap-2 px-4 rounded-full border border-border"
                        style={{ paddingVertical: 10 }}
                        onPress={copyLink}
                    >
                        <Link size={16} color={primaryColor} />
                        <Text
                            className="text-primary"
                            style={{
                                fontSize: 13,
                                fontWeight: '600',
                            }}
                        >
                            {linkCopied ? 'Copied!' : 'Copy link'}
                        </Text>
                    </Pressable>
                    <Pressable
                        onPress={handleDone}
                        disabled={isSaving}
                        className={`px-6 py-3 rounded-3xl bg-primary ${isSaving ? 'opacity-60' : 'opacity-100'}`}
                    >
                        <Text
                            className="text-primary-foreground"
                            style={{
                                fontWeight: '600',
                                fontSize: 14,
                            }}
                        >
                            {isSaving ? 'Saving...' : 'Done'}
                        </Text>
                    </Pressable>
                </View>
            </ModalContent>
        </Modal>
    )
}

function buildMemberSuggestions(
    search: string,
    orgMembers: OrgMember[],
    alreadySharedIds: Set<string>,
    pendingEmails: Set<string>,
    currentUserId: string
): SuggestionEntry[] {
    const q = search.toLowerCase()
    return orgMembers
        .filter(
            m =>
                !alreadySharedIds.has(m.userId) &&
                !pendingEmails.has(m.email.toLowerCase()) &&
                m.userId !== currentUserId &&
                (m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
        )
        .map(m => ({
            key: `member:${m.userId}`,
            userId: m.userId,
            name: m.name,
            email: m.email,
            source: 'member' as const,
        }))
}

function SaveErrorBanner({ message }: { message: string | null }) {
    if (!message) return null
    return (
        <View className="mx-6 mb-2 rounded-lg p-2 bg-danger-soft">
            <Text className="text-xs text-danger">Could not share: {message}</Text>
        </View>
    )
}

function buildContactSuggestions(
    search: string,
    contacts: ContactSuggestion[],
    orgMembers: OrgMember[],
    pendingEmails: Set<string>
): SuggestionEntry[] {
    const q = search.toLowerCase()
    const memberEmails = new Set(orgMembers.map(m => m.email.toLowerCase()))
    return contacts
        .filter(c => {
            if (!c.email) return false
            if (memberEmails.has(c.email.toLowerCase())) return false
            if (pendingEmails.has(c.email.toLowerCase())) return false
            const fullName = `${c.first_name} ${c.last_name}`.toLowerCase()
            return fullName.includes(q) || c.email.toLowerCase().includes(q)
        })
        .slice(0, 5)
        .map(c => ({
            key: `contact:${c.id}`,
            userId: '',
            name: `${c.first_name} ${c.last_name}`.trim(),
            email: c.email,
            source: 'contact' as const,
        }))
}

interface SuggestionsDropdownProps {
    search: string
    orgMembers: OrgMember[]
    alreadySharedIds: Set<string>
    pendingEmails: Set<string>
    currentUserId: string
    onSelect: (s: SuggestionEntry) => void
}

// Members are always available; contacts come from the optional contacts pkg,
// so its rows are appended inside ContactSuggestionsProvider (which renders
// nothing when the package isn't linked). Both branches feed the same
// SuggestionsList so the merged, de-duplicated dropdown renders in one place.
function SuggestionsDropdown({
    search,
    orgMembers,
    alreadySharedIds,
    pendingEmails,
    currentUserId,
    onSelect,
}: SuggestionsDropdownProps) {
    // The optional contacts package supplies extra suggestions; without it we
    // still show org members. Gating on usePackages here (the sanctioned
    // cross-package presence check) lets us render the member list directly
    // when contacts is absent, and merge contact rows in via the provider's
    // render prop when it's present — no lifted state, no effect.
    const contactsLinked = usePackages().some(p => p.slug === 'contacts')

    if (search.length < 1) return null

    const memberSuggestions = buildMemberSuggestions(
        search,
        orgMembers,
        alreadySharedIds,
        pendingEmails,
        currentUserId
    )

    if (!contactsLinked) {
        return <SuggestionsList suggestions={memberSuggestions} onSelect={onSelect} />
    }

    return (
        <ContactSuggestionsProvider>
            {contacts => (
                <SuggestionsList
                    suggestions={[
                        ...memberSuggestions,
                        ...buildContactSuggestions(search, contacts, orgMembers, pendingEmails),
                    ]}
                    onSelect={onSelect}
                />
            )}
        </ContactSuggestionsProvider>
    )
}

function SuggestionsList({
    suggestions,
    onSelect,
}: {
    suggestions: SuggestionEntry[]
    onSelect: (s: SuggestionEntry) => void
}) {
    if (suggestions.length < 1) return null

    return (
        <View
            className="border border-border bg-background overflow-hidden"
            style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 2000,
                marginTop: 2,
                borderRadius: 12,
                ...(webShadow as object),
            }}
        >
            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                {suggestions.map(s => {
                    const firstName = s.name.split(' ')[0] || s.email.split('@')[0]
                    const lastName = s.name.split(' ').slice(1).join(' ')

                    return (
                        <Pressable
                            key={s.key}
                            onPress={() => onSelect(s)}
                            className="flex-row items-center gap-2 px-3"
                            style={{ paddingVertical: 10 }}
                        >
                            <NameAvatar firstName={firstName} lastName={lastName} size={40} />
                            <View className="flex-1 gap-0.5">
                                <Text
                                    className="text-foreground"
                                    style={{ fontSize: 13, fontWeight: '500' }}
                                >
                                    {s.name || s.email}
                                </Text>
                                <Text className="text-muted-foreground" style={{ fontSize: 12 }}>
                                    {s.email}
                                </Text>
                            </View>
                        </Pressable>
                    )
                })}
            </ScrollView>
        </View>
    )
}

function GeneralAccessSection({
    activeShareLink,
    isCreatingPublicLink,
    onTogglePublicLink,
    onCopyPublicLink,
    linkCopied,
}: {
    activeShareLink: ShareLinkEntry | undefined
    isCreatingPublicLink: boolean
    onTogglePublicLink: () => void
    onCopyPublicLink: () => void
    linkCopied: boolean
}) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')
    const primaryColor = useThemeColor('primary')
    const surfaceBgColor = useThemeColor('surface-secondary')
    const successColor = useThemeColor('success')

    if (activeShareLink) {
        return (
            <View>
                <Pressable
                    className="flex-row items-center gap-3"
                    style={{ paddingVertical: 6 }}
                    onPress={onTogglePublicLink}
                >
                    <View
                        className="size-9 items-center justify-center bg-success/20"
                        style={{ borderRadius: 18 }}
                    >
                        <Globe size={16} color={successColor} />
                    </View>
                    <View className="flex-1" style={{ gap: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: fgColor }}>
                            Anyone with the link
                        </Text>
                        <Text style={{ fontSize: 12, color: mutedColor }}>
                            Anyone on the internet with the link can view
                        </Text>
                    </View>
                </Pressable>
                <View className="flex-row gap-2 mt-2">
                    <Pressable
                        className="flex-row items-center gap-2 px-4 rounded-full border"
                        style={{
                            paddingVertical: 10,
                            borderColor,
                        }}
                        onPress={onCopyPublicLink}
                    >
                        <Link size={14} color={primaryColor} />
                        <Text
                            style={{
                                fontSize: 12,
                                fontWeight: '600',
                                color: primaryColor,
                            }}
                        >
                            {linkCopied ? 'Copied!' : 'Copy public link'}
                        </Text>
                    </Pressable>
                    <Pressable
                        className="flex-row items-center gap-2 px-4 rounded-full border"
                        style={{
                            paddingVertical: 10,
                            borderColor,
                        }}
                        onPress={onTogglePublicLink}
                    >
                        <Trash2 size={14} color={mutedColor} />
                        <Text
                            style={{
                                fontSize: 12,
                                fontWeight: '600',
                                color: mutedColor,
                            }}
                        >
                            Revoke
                        </Text>
                    </Pressable>
                </View>
            </View>
        )
    }

    return (
        <Pressable
            className="flex-row items-center gap-3"
            style={{ paddingVertical: 6 }}
            onPress={onTogglePublicLink}
            disabled={isCreatingPublicLink}
        >
            <View
                className="size-9 items-center justify-center"
                style={{
                    borderRadius: 18,
                    backgroundColor: surfaceBgColor,
                }}
            >
                {isCreatingPublicLink ? (
                    <ActivityIndicator size="small" />
                ) : (
                    <Lock size={16} color={mutedColor} />
                )}
            </View>
            <View className="flex-1" style={{ gap: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: fgColor }}>Restricted</Text>
                <Text style={{ fontSize: 12, color: mutedColor }}>
                    Only people with access can open with the link
                </Text>
            </View>
        </Pressable>
    )
}

const ROLE_OPTIONS: { value: 'editor' | 'viewer'; label: string; description: string }[] = [
    { value: 'editor', label: 'Editor', description: 'Can view, comment, and edit' },
    { value: 'viewer', label: 'Viewer', description: 'Can view only' },
]

function RolePicker({
    value,
    onChange,
}: {
    value: 'editor' | 'viewer'
    onChange: (role: 'editor' | 'viewer') => void
}) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')
    const primaryColor = useThemeColor('primary')
    const currentLabel = value === 'editor' ? 'Editor' : 'Viewer'

    return (
        <Menu>
            <Menu.Trigger>
                <Pressable
                    className="flex-row items-center gap-1.5 rounded-md border bg-background"
                    style={{ borderColor, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                    <Text style={{ fontSize: 13, fontWeight: '500', color: fgColor }}>
                        {currentLabel}
                    </Text>
                    <ChevronDown size={14} color={mutedColor} />
                </Pressable>
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Overlay />
                <Menu.Content presentation="popover" placement="bottom" align="end">
                    {ROLE_OPTIONS.map(opt => {
                        const isActive = opt.value === value
                        return (
                            <Menu.Item key={opt.value} onPress={() => onChange(opt.value)}>
                                <View
                                    className="flex-row items-start gap-2"
                                    style={{ minWidth: 220 }}
                                >
                                    <View style={{ width: 16, paddingTop: 2 }}>
                                        {isActive ? <Check size={14} color={primaryColor} /> : null}
                                    </View>
                                    <View className="flex-1 gap-0.5">
                                        <Menu.ItemTitle>{opt.label}</Menu.ItemTitle>
                                        <Text
                                            className="text-muted-foreground"
                                            style={{ fontSize: 12 }}
                                        >
                                            {opt.description}
                                        </Text>
                                    </View>
                                </View>
                            </Menu.Item>
                        )
                    })}
                </Menu.Content>
            </Menu.Portal>
        </Menu>
    )
}
