import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Modal, ModalBackdrop, ModalContent } from '@tinycld/core/ui/modal'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react-native'
import { useCallback, useMemo } from 'react'
import { Platform, Pressable, Modal as RNModal, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
            <RNModal
                visible={isVisible}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={onClose}
            >
                <View className="flex-1" style={{ backgroundColor: background }}>
                    <PreviewModalContent item={item} onClose={onClose} />
                </View>
            </RNModal>
        )
    }

    return (
        <Modal isOpen={isVisible} onClose={onClose}>
            <ModalBackdrop />
            <ModalContent className="w-[95vw] h-[90vh] max-w-[1400px] p-0 rounded-xl overflow-hidden">
                <PreviewModalContent item={item} onClose={onClose} />
            </ModalContent>
        </Modal>
    )
}

function PreviewModalContent({ item, onClose }: { item: DriveItemView; onClose: () => void }) {
    const mutedColor = useThemeColor('muted-foreground')
    const fgColor = useThemeColor('foreground')
    const borderColor = useThemeColor('border')
    const _bgColor = useThemeColor('background')
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
                className="flex-row items-center px-4 py-3 gap-3"
                style={{
                    paddingTop: Math.max(insets.top, 12),
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                }}
            >
                <Pressable onPress={onClose} className="p-1.5">
                    <X size={20} color={mutedColor} />
                </Pressable>
                <Text
                    numberOfLines={1}
                    className="flex-1"
                    style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: fgColor,
                    }}
                >
                    {item.name}
                </Text>
                <View className="flex-row items-center gap-1">
                    {hasPrevious && (
                        <Pressable
                            onPress={handlePrevious}
                            className="p-1.5 rounded-md"
                            hitSlop={8}
                        >
                            <ChevronLeft size={20} color={mutedColor} />
                        </Pressable>
                    )}
                    {hasNext && (
                        <Pressable onPress={handleNext} className="p-1.5 rounded-md" hitSlop={8}>
                            <ChevronRight size={20} color={mutedColor} />
                        </Pressable>
                    )}
                    <Pressable onPress={handleDownload} className="p-1.5 rounded-md" hitSlop={8}>
                        <Download size={18} color={mutedColor} />
                    </Pressable>
                </View>
            </View>
            <View className="flex-1 overflow-hidden">
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
