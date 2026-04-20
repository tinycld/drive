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
    const primaryColor = useThemeColor('primary')
    const [activeTab, setActiveTab] = useState<DetailTab>('details')
    const showVersionsTab = !item.isFolder

    return (
        <View
            style={{
                width: 320,
                borderLeftWidth: 1,
                borderLeftColor: borderColor,
                alignSelf: 'stretch',
                minHeight: 0,
                overflow: 'hidden',
            }}
        >
            <View
                className="flex-row items-start justify-between px-4 py-3 gap-2"
                style={{
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                }}
            >
                <Text
                    numberOfLines={2}
                    className="flex-1"
                    style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: fgColor,
                    }}
                >
                    {item.name}
                </Text>
                <Pressable onPress={onClose} className="p-1">
                    <X size={18} color={mutedColor} />
                </Pressable>
            </View>

            <ScrollView className="flex-1">
                <View className="items-center py-6">
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
                    primaryColor={primaryColor}
                    borderColor={borderColor}
                />

                {activeTab === 'details' && <DetailsContent item={item} />}
                {activeTab === 'versions' && showVersionsTab && <VersionsContent itemId={item.id} />}
                {activeTab === 'activity' && <ActivityContent />}
            </ScrollView>
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
        <View className="p-4">
            {isTrash && (
                <>
                    <View className="gap-2">
                        <Text
                            className="mb-1"
                            style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: fgColor,
                            }}
                        >
                            Original location
                        </Text>
                        <View className="flex-row items-center gap-2">
                            <FolderOpen size={16} color={mutedColor} />
                            <Text style={{ fontSize: 12, color: mutedColor }}>{originalLocation}</Text>
                        </View>
                        <DetailRow
                            label="Deleted"
                            value={formatDate(item.trashedAt)}
                            mutedColor={mutedColor}
                            fgColor={fgColor}
                        />
                    </View>

                    <View
                        className="my-4"
                        style={{
                            height: 1,
                            backgroundColor: borderColor,
                        }}
                    />
                </>
            )}

            <View className="gap-2">
                <Text
                    className="mb-1"
                    style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: fgColor,
                    }}
                >
                    Who has access
                </Text>
                <View className="flex-row items-center gap-2">
                    <View
                        className="size-7 items-center justify-center"
                        style={{
                            borderRadius: 14,
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
                className="my-4"
                style={{
                    height: 1,
                    backgroundColor: borderColor,
                }}
            />

            <View className="gap-2">
                <Text
                    className="mb-1"
                    style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: fgColor,
                    }}
                >
                    File details
                </Text>
                <DetailRow label="Type" value={item.mimeType} mutedColor={mutedColor} fgColor={fgColor} />
                <DetailRow label="Size" value={formatBytes(item.size)} mutedColor={mutedColor} fgColor={fgColor} />
                <DetailRow label="Owner" value={item.owner} mutedColor={mutedColor} fgColor={fgColor} />
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
        <View className="flex-row py-1">
            <Text style={{ fontSize: 12, color: mutedColor, width: 80 }}>{label}</Text>
            <Text numberOfLines={1} className="flex-1" style={{ fontSize: 12, color: fgColor }}>
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
    primaryColor: string
    borderColor: string
}

function TabBar({ tabs, activeTab, onTabPress, mutedColor, primaryColor, borderColor }: TabBarProps) {
    const labels: Record<DetailTab, string> = {
        details: 'Details',
        versions: 'Versions',
        activity: 'Activity',
    }

    return (
        <View className="flex-row" style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}>
            {tabs.map((tab) => (
                <Pressable
                    key={tab}
                    className="flex-1 items-center"
                    style={{
                        paddingVertical: 10,
                        ...(activeTab === tab
                            ? {
                                  borderBottomColor: primaryColor,
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
                            color: activeTab === tab ? primaryColor : mutedColor,
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

    const confirmingVersion = confirmVersionId ? versions.find((v) => v.id === confirmVersionId) : null

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
            <View className="p-4">
                <NeutralMessage>No previous versions</NeutralMessage>
            </View>
        )
    }

    return (
        <>
            <View className="p-4">
                {versions.map((version) => (
                    <VersionRow
                        key={version.id}
                        version={version}
                        onRestore={() => setConfirmVersionId(version.id)}
                        onDownload={() => handleDownload(version)}
                        isRestoring={isRestoring}
                    />
                ))}
            </View>

            <RestoreConfirmDialog
                open={!!confirmingVersion}
                onOpenChange={(open) => {
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

function RestoreConfirmDialog({ open, onOpenChange, versionNumber, onConfirm }: RestoreConfirmDialogProps) {
    const fgColor = useThemeColor('foreground')
    const mutedColor = useThemeColor('muted-foreground')
    const primaryColor = useThemeColor('primary')
    const primaryFgColor = useThemeColor('primary-foreground')

    return (
        <Modal isOpen={open} onClose={() => onOpenChange(false)}>
            <ModalBackdrop />
            <ModalContent className="w-[340px] p-4 gap-3">
                <Text style={{ fontSize: 20, fontWeight: '600', color: fgColor }}>Restore version</Text>
                <Text style={{ fontSize: 13, color: mutedColor }}>
                    Restore to version {versionNumber}? The current file will be saved as a new version before
                    restoring.
                </Text>
                <View className="flex-row gap-3 justify-end">
                    <Pressable onPress={() => onOpenChange(false)} className="px-3 py-2">
                        <Text style={{ fontSize: 13, color: fgColor }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                        onPress={() => {
                            onConfirm()
                            onOpenChange(false)
                        }}
                        className="px-4 py-2 rounded-md"
                        style={{ backgroundColor: primaryColor }}
                    >
                        <Text style={{ fontWeight: '600', color: primaryFgColor }}>Restore</Text>
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
            className="flex-row items-center justify-between"
            style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
            }}
        >
            <View className="flex-1 gap-0.5">
                <Text style={{ fontSize: 12, fontWeight: '500', color: fgColor }}>
                    Version {version.version_number}
                </Text>
                <Text style={{ fontSize: 11, color: mutedColor }}>
                    {formatDate(version.created)} · {formatBytes(version.size)}
                </Text>
            </View>
            <View className="flex-row gap-2">
                <Pressable onPress={onDownload} hitSlop={8} className="p-1">
                    <Download size={14} color={mutedColor} />
                </Pressable>
                <Pressable onPress={onRestore} hitSlop={8} disabled={isRestoring} className="p-1">
                    {isRestoring ? <ActivityIndicator size="small" /> : <RotateCcw size={14} color={mutedColor} />}
                </Pressable>
            </View>
        </View>
    )
}

function NeutralMessage({ children }: { children: string }) {
    const mutedColor = useThemeColor('muted-foreground')
    return (
        <Text
            className="text-center py-6"
            style={{
                fontSize: 13,
                color: mutedColor,
            }}
        >
            {children}
        </Text>
    )
}

function ActivityContent() {
    return (
        <View className="p-4">
            <NeutralMessage>No recent activity</NeutralMessage>
        </View>
    )
}
