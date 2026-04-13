import { useLiveQuery } from '@tanstack/react-db'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Globe, Link, Lock, Trash2 } from 'lucide-react-native'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { NameAvatar } from '~/components/NameAvatar'
import { captureException } from '~/lib/errors'
import { pb, useStore } from '~/lib/pocketbase'
import { useThemeColor } from '~/lib/use-app-theme'
import { Modal, ModalBackdrop, ModalContent } from '~/ui/modal'
import { PlainInput } from '~/ui/PlainInput'

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
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')
    const accentColor = useThemeColor('accent')
    const accentFgColor = useThemeColor('accent-foreground')
    const bgColor = useThemeColor('background')
    const _surfaceBgColor = useThemeColor('surface-secondary')
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
        ? `${window.location.origin}/share/${activeShareLink.token}`
        : ''

    const [contactsCollection] = useStore('contacts')
    const { data: contacts } = useLiveQuery(
        query =>
            query
                .from({ contacts: contactsCollection })
                .orderBy(({ contacts: c }) => c.first_name, 'asc'),
        []
    )

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
                url = `${window.location.origin}/share/${resp.token}`
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
            <ModalContent className="w-[540px] p-0 rounded-2xl">
                <View
                    style={{
                        paddingHorizontal: 24,
                        paddingTop: 28,
                        paddingBottom: 16,
                    }}
                >
                    <Text style={{ fontSize: 28, color: fgColor }}>
                        Share &ldquo;{itemName}&rdquo;
                    </Text>
                </View>

                <View
                    style={{
                        paddingHorizontal: 24,
                        paddingBottom: 20,
                        position: 'relative',
                        zIndex: 100,
                        overflow: 'visible',
                    }}
                >
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            borderWidth: 2,
                            borderRadius: 8,
                            paddingHorizontal: 14,
                            paddingVertical: 14,
                            borderColor: accentColor,
                        }}
                    >
                        <PlainInput
                            value={search}
                            onChangeText={setSearch}
                            placeholder="Add people by name or email"
                            placeholderTextColor={accentColor}
                            style={{ flex: 1, fontSize: 15, color: fgColor }}
                            autoFocus
                        />
                        <RolePicker
                            value={defaultRole}
                            onChange={setDefaultRole}
                            mutedColor={mutedColor}
                            fgColor={fgColor}
                            borderColor={borderColor}
                        />
                    </View>

                    {suggestions.length > 0 && (
                        <View
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                zIndex: 2000,
                                marginTop: 2,
                                borderWidth: 1,
                                borderRadius: 12,
                                borderColor,
                                backgroundColor: bgColor,
                                overflow: 'hidden',
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
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 8,
                                                paddingHorizontal: 12,
                                                paddingVertical: 10,
                                            }}
                                        >
                                            <NameAvatar
                                                firstName={firstName}
                                                lastName={lastName}
                                                size={40}
                                            />
                                            <View style={{ flex: 1, gap: 2 }}>
                                                <Text
                                                    style={{
                                                        fontSize: 13,
                                                        fontWeight: '500',
                                                        color: fgColor,
                                                    }}
                                                >
                                                    {s.name || s.email}
                                                </Text>
                                                <Text
                                                    style={{
                                                        fontSize: 12,
                                                        color: mutedColor,
                                                    }}
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

                {pending.length > 0 && (
                    <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
                        {pending.map(p => (
                            <View
                                key={p.key}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 12,
                                    paddingVertical: 6,
                                }}
                            >
                                <NameAvatar firstName={p.name || p.email} size={36} />
                                <View style={{ flex: 1, gap: 1 }}>
                                    <Text
                                        numberOfLines={1}
                                        style={{
                                            fontSize: 13,
                                            fontWeight: '500',
                                            color: fgColor,
                                        }}
                                    >
                                        {p.name || p.email}
                                    </Text>
                                    <Text
                                        numberOfLines={1}
                                        style={{ fontSize: 12, color: mutedColor }}
                                    >
                                        {p.email}
                                    </Text>
                                </View>
                                <RolePicker
                                    value={p.role}
                                    onChange={role => setPendingRole(p.key, role)}
                                    mutedColor={mutedColor}
                                    fgColor={fgColor}
                                    borderColor={borderColor}
                                />
                                <Pressable
                                    onPress={() => removePending(p.key)}
                                    style={{ padding: 6 }}
                                >
                                    <Trash2 size={14} color={mutedColor} />
                                </Pressable>
                            </View>
                        ))}
                    </View>
                )}

                <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
                    <Text
                        style={{
                            fontSize: 16,
                            fontWeight: '600',
                            color: fgColor,
                            marginBottom: 12,
                        }}
                    >
                        People with access
                    </Text>

                    {currentUserShare && (
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 12,
                                paddingVertical: 6,
                            }}
                        >
                            <NameAvatar
                                firstName={currentUserShare.name || currentUserShare.email}
                                size={36}
                            />
                            <View style={{ flex: 1, gap: 1 }}>
                                <Text
                                    style={{
                                        fontSize: 13,
                                        fontWeight: '500',
                                        color: fgColor,
                                    }}
                                >
                                    {currentUserShare.name || currentUserShare.email} (you)
                                </Text>
                                <Text style={{ fontSize: 12, color: mutedColor }}>
                                    {currentUserShare.email}
                                </Text>
                            </View>
                            <Text
                                style={{
                                    fontSize: 12,
                                    color: mutedColor,
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
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 12,
                                paddingVertical: 6,
                            }}
                        >
                            <NameAvatar firstName={share.name || share.email} size={36} />
                            <View style={{ flex: 1, gap: 1 }}>
                                <Text
                                    numberOfLines={1}
                                    style={{
                                        fontSize: 13,
                                        fontWeight: '500',
                                        color: fgColor,
                                    }}
                                >
                                    {share.name || share.email}
                                </Text>
                                <Text numberOfLines={1} style={{ fontSize: 12, color: mutedColor }}>
                                    {share.email}
                                </Text>
                            </View>
                            <Text
                                style={{
                                    fontSize: 12,
                                    color: mutedColor,
                                    textTransform: 'capitalize',
                                }}
                            >
                                {share.role}
                            </Text>
                            <Pressable
                                onPress={() => onRemoveShare(share.id)}
                                style={{ padding: 6 }}
                            >
                                <Trash2 size={14} color={mutedColor} />
                            </Pressable>
                        </View>
                    ))}
                </View>

                <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
                    <Text
                        style={{
                            fontSize: 16,
                            fontWeight: '600',
                            color: fgColor,
                            marginBottom: 12,
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
                                    await pb.send(`/api/drive/share-link/${activeShareLink.id}`, {
                                        method: 'DELETE',
                                    })
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

                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 24,
                        paddingVertical: 16,
                        borderTopWidth: 1,
                        borderTopColor: borderColor,
                    }}
                >
                    <Pressable
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: 24,
                            borderWidth: 1,
                            borderColor,
                        }}
                        onPress={copyLink}
                    >
                        <Link size={16} color={accentColor} />
                        <Text
                            style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: accentColor,
                            }}
                        >
                            {linkCopied ? 'Copied!' : 'Copy link'}
                        </Text>
                    </Pressable>
                    <Pressable
                        onPress={handleDone}
                        disabled={isSaving}
                        style={{
                            paddingHorizontal: 24,
                            paddingVertical: 12,
                            borderRadius: 24,
                            backgroundColor: accentColor,
                            opacity: isSaving ? 0.6 : 1,
                        }}
                    >
                        <Text
                            style={{
                                fontWeight: '600',
                                fontSize: 14,
                                color: accentFgColor,
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
    const accentColor = useThemeColor('accent')
    const surfaceBgColor = useThemeColor('surface-secondary')
    const successColor = useThemeColor('success')

    if (activeShareLink) {
        return (
            <View>
                <Pressable
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 6,
                    }}
                    onPress={onTogglePublicLink}
                >
                    <View
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: `${successColor}20`,
                        }}
                    >
                        <Globe size={16} color={successColor} />
                    </View>
                    <View style={{ flex: 1, gap: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '500', color: fgColor }}>
                            Anyone with the link
                        </Text>
                        <Text style={{ fontSize: 12, color: mutedColor }}>
                            Anyone on the internet with the link can view
                        </Text>
                    </View>
                </Pressable>
                <View
                    style={{
                        flexDirection: 'row',
                        gap: 8,
                        marginTop: 8,
                    }}
                >
                    <Pressable
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: 24,
                            borderWidth: 1,
                            borderColor,
                        }}
                        onPress={onCopyPublicLink}
                    >
                        <Link size={14} color={accentColor} />
                        <Text
                            style={{
                                fontSize: 12,
                                fontWeight: '600',
                                color: accentColor,
                            }}
                        >
                            {linkCopied ? 'Copied!' : 'Copy public link'}
                        </Text>
                    </Pressable>
                    <Pressable
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: 24,
                            borderWidth: 1,
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
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 6,
            }}
            onPress={onTogglePublicLink}
            disabled={isCreatingPublicLink}
        >
            <View
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: surfaceBgColor,
                }}
            >
                {isCreatingPublicLink ? (
                    <ActivityIndicator size="small" />
                ) : (
                    <Lock size={16} color={mutedColor} />
                )}
            </View>
            <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: fgColor }}>Restricted</Text>
                <Text style={{ fontSize: 12, color: mutedColor }}>
                    Only people with access can open with the link
                </Text>
            </View>
        </Pressable>
    )
}

function RolePicker({
    value,
    onChange,
    mutedColor,
    fgColor,
    borderColor,
}: {
    value: 'editor' | 'viewer'
    onChange: (role: 'editor' | 'viewer') => void
    mutedColor: string
    fgColor: string
    borderColor: string
}) {
    return (
        <Pressable
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                borderWidth: 1,
                borderColor,
            }}
            onPress={() => onChange(value === 'editor' ? 'viewer' : 'editor')}
        >
            <Text style={{ fontSize: 12, color: fgColor }}>
                {value === 'editor' ? 'Editor' : 'Viewer'}
            </Text>
            <ChevronDown size={14} color={mutedColor} />
        </Pressable>
    )
}
