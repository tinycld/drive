import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react-native'
import { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Button, Dialog, SizableText, useTheme, View, XStack } from 'tamagui'
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
    if (!item) return null

    return (
        <Dialog
            modal
            open={isVisible}
            onOpenChange={o => {
                if (!o) onClose()
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay
                    key="overlay"
                    opacity={0.6}
                    backgroundColor="$shadow6"
                    enterStyle={{ opacity: 0 }}
                    exitStyle={{ opacity: 0 }}
                />
                <Dialog.Content
                    key="content"
                    bordered
                    elevate
                    padding={0}
                    width="95vw"
                    height="90vh"
                    maxWidth={1400}
                    backgroundColor="$background"
                    borderRadius={12}
                    overflow="hidden"
                >
                    <PreviewModalContent item={item} onClose={onClose} />
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    )
}

function PreviewModalContent({ item, onClose }: { item: DriveItemView; onClose: () => void }) {
    const theme = useTheme()
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
            <XStack
                alignItems="center"
                px="$4"
                py="$3"
                borderBottomWidth={1}
                borderBottomColor="$borderColor"
                gap="$3"
            >
                <SizableText size="$4" fontWeight="600" color="$color" numberOfLines={1} flex={1}>
                    {item.name}
                </SizableText>
                <XStack alignItems="center" gap="$1">
                    {hasPrevious && (
                        <Pressable onPress={handlePrevious} style={styles.headerButton} hitSlop={8}>
                            <ChevronLeft size={20} color={theme.color8.val} />
                        </Pressable>
                    )}
                    {hasNext && (
                        <Pressable onPress={handleNext} style={styles.headerButton} hitSlop={8}>
                            <ChevronRight size={20} color={theme.color8.val} />
                        </Pressable>
                    )}
                    <Pressable onPress={handleDownload} style={styles.headerButton} hitSlop={8}>
                        <Download size={18} color={theme.color8.val} />
                    </Pressable>
                    <Dialog.Close asChild>
                        <Button size="$2" chromeless circular>
                            <X size={20} color={theme.color8.val} />
                        </Button>
                    </Dialog.Close>
                </XStack>
            </XStack>
            <View flex={1} overflow="hidden">
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

const styles = StyleSheet.create({
    headerButton: {
        padding: 6,
        borderRadius: 6,
    },
})
