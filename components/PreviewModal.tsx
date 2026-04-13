import { Dialog } from 'heroui-native'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react-native'
import { useCallback, useMemo } from 'react'
import { Modal, Platform, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBreakpoint } from '~/components/workspace/useBreakpoint'
import { useThemeColor } from '~/lib/use-app-theme'
import { useDrive } from '../hooks/useDrive'
import { getPreviewEntry } from '../lib/preview-registry'
import type { DriveItemView } from '../types'
import { GenericPreview } from './previews/GenericPreview'

interface PreviewModalProps {
    isVisible: boolean
    item: DriveItemView | null
    onClose: () => void
}

export function PreviewModal({ isVisible, item, onClose }: PreviewModalProps) {
    const isMobile = useBreakpoint() === 'mobile'
    const background = useThemeColor('background')

    if (!item) return null

    if (isMobile || Platform.OS !== 'web') {
        return (
            <Modal
                visible={isVisible}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={onClose}
            >
                <View style={{ flex: 1, backgroundColor: background }}>
                    <PreviewModalContent item={item} onClose={onClose} />
                </View>
            </Modal>
        )
    }

    return (
        <Dialog
            isOpen={isVisible}
            onOpenChange={o => {
                if (!o) onClose()
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay />
                <Dialog.Content className="w-[95vw] h-[90vh] max-w-[1400px] p-0 rounded-xl overflow-hidden">
                    <PreviewModalContent item={item} onClose={onClose} />
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    )
}

function PreviewModalContent({ item, onClose }: { item: DriveItemView; onClose: () => void }) {
    const [mutedColor, fgColor, borderColor, _bgColor] = useThemeColor([
        'muted',
        'foreground',
        'border',
        'background',
    ])
    const insets = useSafeAreaInsets()
    const { currentItems, openPreview, downloadItem } = useDrive()

    const files = useMemo(() => currentItems.filter(i => !i.isFolder), [currentItems])
    const currentIndex = files.findIndex(f => f.id === item.id)

    const handlePrevious = useCallback(() => {
        if (currentIndex > 0) openPreview(files[currentIndex - 1])
    }, [currentIndex, files, openPreview])

    const handleNext = useCallback(() => {
        if (currentIndex < files.length - 1) openPreview(files[currentIndex + 1])
    }, [currentIndex, files, openPreview])

    const hasPrevious = currentIndex > 0
    const hasNext = currentIndex < files.length - 1

    const entry = getPreviewEntry(item.mimeType)
    const PreviewComponent = entry?.preview ?? GenericPreview

    const handleDownload = useCallback(() => {
        downloadItem(item.id)
    }, [downloadItem, item.id])

    return (
        <>
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    paddingTop: Math.max(insets.top, 12),
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                    gap: 12,
                }}
            >
                <Pressable onPress={onClose} style={{ padding: 6 }}>
                    <X size={20} color={mutedColor} />
                </Pressable>
                <Text
                    numberOfLines={1}
                    style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: fgColor,
                        flex: 1,
                    }}
                >
                    {item.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {hasPrevious && (
                        <Pressable
                            onPress={handlePrevious}
                            style={{ padding: 6, borderRadius: 6 }}
                            hitSlop={8}
                        >
                            <ChevronLeft size={20} color={mutedColor} />
                        </Pressable>
                    )}
                    {hasNext && (
                        <Pressable
                            onPress={handleNext}
                            style={{ padding: 6, borderRadius: 6 }}
                            hitSlop={8}
                        >
                            <ChevronRight size={20} color={mutedColor} />
                        </Pressable>
                    )}
                    <Pressable
                        onPress={handleDownload}
                        style={{ padding: 6, borderRadius: 6 }}
                        hitSlop={8}
                    >
                        <Download size={18} color={mutedColor} />
                    </Pressable>
                </View>
            </View>
            <View style={{ flex: 1, overflow: 'hidden' }}>
                <PreviewComponent
                    item={item}
                    onClose={onClose}
                    onNext={hasNext ? handleNext : undefined}
                    onPrevious={hasPrevious ? handlePrevious : undefined}
                />
            </View>
        </>
    )
}
