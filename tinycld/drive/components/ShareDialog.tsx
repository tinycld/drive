import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { NameAvatar } from '@tinycld/core/components/NameAvatar'
import {
    type ContactSuggestion,
    ContactSuggestionsProvider,
} from '@tinycld/core/lib/contacts/use-contact-suggestions'
import { captureException } from '@tinycld/core/lib/errors'
import { pb } from '@tinycld/core/lib/pocketbase'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Menu } from '@tinycld/core/ui/menu'
import { Modal, ModalBackdrop, ModalContent } from '@tinycld/core/ui/modal'
import { PlainInput } from '@tinycld/core/ui/PlainInput'
import { Check, ChevronDown, Globe, Link, Lock, Trash2, X } from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native'

// Local bridge: mounts inside ContactSuggestionsProvider's render prop and
// pushes the contacts list up into ShareDialog's state via useEffect, so the
// rest of the dialog can keep using `contacts` directly inside its
// suggestion-building useMemo.
function ContactsBridge({
    contacts,
    onChange,
}: {
    contacts: ContactSuggestion[]
    onChange: (next: ContactSuggestion[]) => void
}) {
    useEffect(() => {
        onChange(contacts)
    }, [contacts, onChange])
    return null
}

interface OrgMember {
    userOrgId: string
    name: string
    email: string
}

interface ShareEntry {
    id: string
    userOrgId: string
    name: string
    email: string
    role: string
}

interface ShareLinkEntry {
    id: string
    token: string
    url: string
    role: string
    is_active: boolean
    expires_at: string
    download_count: number
    last_accessed_at: string
    created: string
}

interface PendingShare {
    key: string
    userOrgId: string
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
    currentUserOrgId: string
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
    currentUserOrgId,
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
    const [isCreatingPublicLink, setIsCreatingPublicLink] = useState(false)
    const queryClient = useQueryClient()

    const { data: shareLinksData } = useQuery<{ links: ShareLinkEntry[] }>({
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

    // Contacts is an optional sibling package; load suggestions from it
    // only when installed. The source component mounts no hooks when
    // @tinycld/contacts isn't linked, so ShareDialog works without it.
    const [contacts, setContacts] = useState<ContactSuggestion[]>([])

    const copyLink = useCallback(async () => {
        if (Platform.OS !== 'web') return
        let url = publicShareUrl
        if (!url) {
            try {
                setIsCreatingPublicLink(true)
                const resp = await pb.send('/api/drive/share-link', {
                    method: 'POST',
                    body: { item_id: itemId, role: 'viewer' },
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

    const alreadySharedIds = useMemo(() => new Set(shares.map(s => s.userOrgId)), [shares])
    const pendingEmails = useMemo(() => new Set(pending.map(p => p.email.toLowerCase())), [pending])

    const suggestions = useMemo(() => {
        if (search.length < 1) return []
        const q = search.toLowerCase()

        const memberResults = orgMembers
            .filter(
                m =>
                    !alreadySharedIds.has(m.userOrgId) &&
                    !pendingEmails.has(m.email.toLowerCase()) &&
                    m.userOrgId !== currentUserOrgId &&
                    (m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
            )
            .map(m => ({
                key: `member:${m.userOrgId}`,
                userOrgId: m.userOrgId,
                name: m.name,
                email: m.email,
                source: 'member' as const,
            }))

        const memberEmails = new Set(orgMembers.map(m => m.email.toLowerCase()))
        const contactResults = (contacts ?? [])
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
                userOrgId: '',
                name: `${c.first_name} ${c.last_name}`.trim(),
                email: c.email,
                source: 'contact' as const,
            }))

        return [...memberResults, ...contactResults]
    }, [search, orgMembers, contacts, alreadySharedIds, pendingEmails, currentUserOrgId])

    const handleSelect = (s: (typeof suggestions)[number]) => {
        setPending(prev => [
            ...prev,
            {
                key: s.key,
                userOrgId: s.userOrgId,
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
                            user_org_id: p.userOrgId || undefined,
                            email: p.email,
                            name: p.name,
                            role: p.role,
                        })),
                    },
                })
            } catch {
                // Shares may have partially succeeded -- close anyway
            } finally {
                setIsSaving(false)
            }
        }
        setPending([])
        setSearch('')
        onClose()
    }

    const currentUserShare = shares.find(s => s.userOrgId === currentUserOrgId)
    const otherShares = shares.filter(s => s.userOrgId !== currentUserOrgId)

    return (
        <Modal isOpen={open} onClose={onClose}>
            <ModalBackdrop />
            <ModalContent
                className="w-[540px] p-0 rounded-2xl overflow-hidden"
                style={{ maxHeight: '90vh' } as object}
            >
                <ContactSuggestionsProvider>
                    {list => <ContactsBridge contacts={list} onChange={setContacts} />}
                </ContactSuggestionsProvider>
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

                    {suggestions.length > 0 && (
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
                            <ScrollView
                                style={{ maxHeight: 300 }}
                                keyboardShouldPersistTaps="handled"
                            >
                                {suggestions.map(s => {
                                    const firstName = s.name.split(' ')[0] || s.email.split('@')[0]
                                    const lastName = s.name.split(' ').slice(1).join(' ')

                                    return (
                                        <Pressable
                                            key={s.key}
                                            onPress={() => handleSelect(s)}
                                            className="flex-row items-center gap-2 px-3"
                                            style={{ paddingVertical: 10 }}
                                        >
                                            <NameAvatar
                                                firstName={firstName}
                                                lastName={lastName}
                                                size={40}
                                            />
                                            <View className="flex-1 gap-0.5">
                                                <Text
                                                    className="text-foreground"
                                                    style={{
                                                        fontSize: 13,
                                                        fontWeight: '500',
                                                    }}
                                                >
                                                    {s.name || s.email}
                                                </Text>
                                                <Text
                                                    className="text-muted-foreground"
                                                    style={{ fontSize: 12 }}
                                                >
                                                    {s.email}
                                                </Text>
                                            </View>
                                        </Pressable>
                                    )
                                })}
                            </ScrollView>
                        </View>
                    )}
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
                                            body: { item_id: itemId, role: 'viewer' },
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
