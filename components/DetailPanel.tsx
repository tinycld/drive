import { Download, FolderOpen, RotateCcw, X } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { formatBytes, formatDate } from '~/lib/format-utils'
import { pb } from '~/lib/pocketbase'
import { useThemeColor } from '~/lib/use-app-theme'
import { Modal, ModalBackdrop, ModalContent } from '~/ui/modal'
import { useDrive } from '../hooks/useDrive'
import { useVersionHistory } from '../hooks/useVersionHistory'
import type { DriveItemView } from '../types'
import { Thumbnail } from './Thumbnail'

interface DetailPanelProps {
    isVisible: boolean
    item: DriveItemView | undefined
    onClose: () => void
}

export function DetailPanel({ isVisible, item, onClose }: DetailPanelProps) {
    if (!isVisible || !item) return null

    return <DetailPanelContent item={item} onClose={onClose} />
}

type DetailTab = 'details' | 'versions' | 'activity'

function DetailPanelContent({ item, onClose }: { item: DriveItemView; onClose: () => void }) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')
    const _accentColor = useThemeColor('accent')
    const accentFgColor = useThemeColor('accent-foreground')
    const [activeTab, setActiveTab] = useState<DetailTab>('details')
    const showVersionsTab = !item.isFolder

    return (
        <View style={{ width: 320, borderLeftWidth: 1, borderLeftColor: borderColor }}>
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                    gap: 8,
                }}
            >
                <Text
                    numberOfLines={2}
                    style={{
                        fontSize: 16,
                        fontWeight: '600',
                        flex: 1,
                        color: fgColor,
                    }}
                >
                    {item.name}
                </Text>
                <Pressable onPress={onClose} style={{ padding: 4 }}>
                    <X size={18} color={mutedColor} />
                </Pressable>
            </View>

            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Thumbnail item={item} size={120} />
            </View>

            <TabBar
                tabs={
                    showVersionsTab
                        ? (['details', 'versions', 'activity'] as const)
                        : (['details', 'activity'] as const)
                }
                activeTab={activeTab}
                onTabPress={setActiveTab}
                mutedColor={mutedColor}
                accentFgColor={accentFgColor}
                borderColor={borderColor}
            />

            {activeTab === 'details' && <DetailsContent item={item} />}
            {activeTab === 'versions' && showVersionsTab && <VersionsContent itemId={item.id} />}
            {activeTab === 'activity' && <ActivityContent />}
        </View>
    )
}

function DetailsContent({ item }: { item: DriveItemView }) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')
    const accentColor = useThemeColor('accent')
    const accentFgColor = useThemeColor('accent-foreground')
    const { activeSection, getItemPath } = useDrive()
    const accessText = item.shared ? 'Shared with others' : 'Private to you'
    const isTrash = activeSection === 'trash'
    const originalLocation = isTrash ? getItemPath(item.parentId) : null

    return (
        <View style={{ padding: 16 }}>
            {isTrash && (
                <>
                    <View style={{ gap: 8 }}>
                        <Text
                            style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: fgColor,
                                marginBottom: 4,
                            }}
                        >
                            Original location
                        </Text>
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <FolderOpen size={16} color={mutedColor} />
                            <Text style={{ fontSize: 12, color: mutedColor }}>
                                {originalLocation}
                            </Text>
                        </View>
                        <DetailRow
                            label="Deleted"
                            value={formatDate(item.trashedAt)}
                            mutedColor={mutedColor}
                            fgColor={fgColor}
                        />
                    </View>

                    <View
                        style={{
                            height: 1,
                            marginVertical: 16,
                            backgroundColor: borderColor,
                        }}
                    />
                </>
            )}

            <View style={{ gap: 8 }}>
                <Text
                    style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: fgColor,
                        marginBottom: 4,
                    }}
                >
                    Who has access
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: accentColor,
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 11,
                                fontWeight: '600',
                                color: accentFgColor,
                            }}
                        >
                            {item.owner === 'me' ? 'Y' : item.owner.charAt(0)}
                        </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: mutedColor }}>{accessText}</Text>
                </View>
            </View>

            <View
                style={{
                    height: 1,
                    marginVertical: 16,
                    backgroundColor: borderColor,
                }}
            />

            <View style={{ gap: 8 }}>
                <Text
                    style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: fgColor,
                        marginBottom: 4,
                    }}
                >
                    File details
                </Text>
                <DetailRow
                    label="Type"
                    value={item.mimeType}
                    mutedColor={mutedColor}
                    fgColor={fgColor}
                />
                <DetailRow
                    label="Size"
                    value={formatBytes(item.size)}
                    mutedColor={mutedColor}
                    fgColor={fgColor}
                />
                <DetailRow
                    label="Owner"
                    value={item.owner}
                    mutedColor={mutedColor}
                    fgColor={fgColor}
                />
                <DetailRow
                    label="Modified"
                    value={formatDate(item.updated)}
                    mutedColor={mutedColor}
                    fgColor={fgColor}
                />
            </View>
        </View>
    )
}

function DetailRow({
    label,
    value,
    mutedColor,
    fgColor,
}: {
    label: string
    value: string
    mutedColor: string
    fgColor: string
}) {
    return (
        <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: mutedColor, width: 80 }}>{label}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: fgColor, flex: 1 }}>
                {value}
            </Text>
        </View>
    )
}

interface TabBarProps {
    tabs: readonly DetailTab[]
    activeTab: DetailTab
    onTabPress: (tab: DetailTab) => void
    mutedColor: string
    accentFgColor: string
    borderColor: string
}

function TabBar({
    tabs,
    activeTab,
    onTabPress,
    mutedColor,
    accentFgColor,
    borderColor,
}: TabBarProps) {
    const labels: Record<DetailTab, string> = {
        details: 'Details',
        versions: 'Versions',
        activity: 'Activity',
    }

    return (
        <View
            style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: borderColor }}
        >
            {tabs.map(tab => (
                <Pressable
                    key={tab}
                    style={{
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: 10,
                        ...(activeTab === tab
                            ? {
                                  borderBottomColor: accentFgColor,
                                  borderBottomWidth: 2,
                              }
                            : {}),
                    }}
                    onPress={() => onTabPress(tab)}
                >
                    <Text
                        style={{
                            fontSize: 13,
                            fontWeight: '500',
                            color: activeTab === tab ? accentFgColor : mutedColor,
                        }}
                    >
                        {labels[tab]}
                    </Text>
                </Pressable>
            ))}
        </View>
    )
}

function VersionsContent({ itemId }: { itemId: string }) {
    const { versions, restoreVersion, isRestoring } = useVersionHistory(itemId)
    const [confirmVersionId, setConfirmVersionId] = useState<string | null>(null)

    const confirmingVersion = confirmVersionId
        ? versions.find(v => v.id === confirmVersionId)
        : null

    const handleConfirmRestore = useCallback(() => {
        if (!confirmVersionId) return
        restoreVersion(confirmVersionId)
        setConfirmVersionId(null)
    }, [confirmVersionId, restoreVersion])

    const handleDownload = useCallback((version: { id: string; file: string }) => {
        const url = pb.files.getURL(
            {
                id: version.id,
                collectionId: 'pbc_drive_versions_01',
                collectionName: 'drive_item_versions',
            },
            version.file
        )
        if (typeof window !== 'undefined') {
            window.open(url, '_blank')
        }
    }, [])

    if (versions.length === 0) {
        return (
            <View style={{ padding: 16 }}>
                <NeutralMessage>No previous versions</NeutralMessage>
            </View>
        )
    }

    return (
        <>
            <ScrollView style={{ padding: 16 }}>
                {versions.map(version => (
                    <VersionRow
                        key={version.id}
                        version={version}
                        onRestore={() => setConfirmVersionId(version.id)}
                        onDownload={() => handleDownload(version)}
                        isRestoring={isRestoring}
                    />
                ))}
            </ScrollView>

            <RestoreConfirmDialog
                open={!!confirmingVersion}
                onOpenChange={open => {
                    if (!open) setConfirmVersionId(null)
                }}
                versionNumber={confirmingVersion?.version_number ?? 0}
                onConfirm={handleConfirmRestore}
            />
        </>
    )
}

interface RestoreConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    versionNumber: number
    onConfirm: () => void
}

function RestoreConfirmDialog({
    open,
    onOpenChange,
    versionNumber,
    onConfirm,
}: RestoreConfirmDialogProps) {
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const accentColor = useThemeColor('accent')
    const accentFgColor = useThemeColor('accent-foreground')

    return (
        <Modal isOpen={open} onClose={() => onOpenChange(false)}>
            <ModalBackdrop />
            <ModalContent className="w-[340px] p-4 gap-3">
                <Text style={{ fontSize: 20, fontWeight: '600', color: fgColor }}>
                    Restore version
                </Text>
                <Text style={{ fontSize: 13, color: mutedColor }}>
                    Restore to version {versionNumber}? The current file will be saved as a new
                    version before restoring.
                </Text>
                <View
                    style={{
                        flexDirection: 'row',
                        gap: 12,
                        justifyContent: 'flex-end',
                    }}
                >
                    <Pressable
                        onPress={() => onOpenChange(false)}
                        style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                    >
                        <Text style={{ fontSize: 13, color: fgColor }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                        onPress={() => {
                            onConfirm()
                            onOpenChange(false)
                        }}
                        style={{
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 6,
                            backgroundColor: accentColor,
                        }}
                    >
                        <Text style={{ fontWeight: '600', color: accentFgColor }}>Restore</Text>
                    </Pressable>
                </View>
            </ModalContent>
        </Modal>
    )
}

interface VersionRowProps {
    version: {
        id: string
        version_number: number
        size: number
        created: string
        file: string
    }
    onRestore: () => void
    onDownload: () => void
    isRestoring: boolean
}

function VersionRow({ version, onRestore, onDownload, isRestoring }: VersionRowProps) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')

    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
            }}
        >
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: fgColor }}>
                    Version {version.version_number}
                </Text>
                <Text style={{ fontSize: 11, color: mutedColor }}>
                    {formatDate(version.created)} · {formatBytes(version.size)}
                </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={onDownload} hitSlop={8} style={{ padding: 4 }}>
                    <Download size={14} color={mutedColor} />
                </Pressable>
                <Pressable
                    onPress={onRestore}
                    hitSlop={8}
                    disabled={isRestoring}
                    style={{ padding: 4 }}
                >
                    {isRestoring ? (
                        <ActivityIndicator size="small" />
                    ) : (
                        <RotateCcw size={14} color={mutedColor} />
                    )}
                </Pressable>
            </View>
        </View>
    )
}

function NeutralMessage({ children }: { children: string }) {
    const mutedColor = useThemeColor('muted-foreground')
    return (
        <Text
            style={{
                fontSize: 13,
                color: mutedColor,
                textAlign: 'center',
                paddingVertical: 24,
            }}
        >
            {children}
        </Text>
    )
}

function ActivityContent() {
    return (
        <View style={{ padding: 16 }}>
            <NeutralMessage>No recent activity</NeutralMessage>
        </View>
    )
}
