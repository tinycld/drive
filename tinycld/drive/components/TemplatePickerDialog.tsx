import { Thumbnail as CoreThumbnail } from '@tinycld/core/file-viewer/Thumbnail'
import type { FilePreviewSource } from '@tinycld/core/file-viewer/types'
import { formatRelativeDate } from '@tinycld/core/lib/format-utils'
import { Modal, ModalBackdrop, ModalContent } from '@tinycld/core/ui/modal'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { type TemplateItem, useTemplateItems } from '../hooks/use-template-items'
import { type TemplateExtension, templateDisplayName } from '../lib/template-naming'

interface TemplatePickerDialogProps {
    open: boolean
    /** Which template family to list — `.tmpl.docx` (text) or `.tmpl.xlsx` (calc). */
    extension: TemplateExtension
    /** Fired with the chosen template's id + name; the caller copies it into a new document. */
    onPick: (item: { id: string; name: string }) => void
    onClose: () => void
    title?: string
    /** Disables the rows while a copy is in flight so a double-tap can't create two documents. */
    isPending?: boolean
}

export function TemplatePickerDialog(props: TemplatePickerDialogProps) {
    // Unmount the body when closed so the live query stops fetching
    // between opens (mirrors ChooseFolderDialog).
    if (!props.open) return null
    return <TemplatePickerDialogBody {...props} />
}

function TemplatePickerDialogBody({
    extension,
    onPick,
    onClose,
    title = 'New from template',
    isPending = false,
}: TemplatePickerDialogProps) {
    const { items, isLoading } = useTemplateItems(extension)

    return (
        <Modal isOpen onClose={onClose}>
            <ModalBackdrop />
            <ModalContent testID="template-picker-dialog" className="w-[440px] max-h-[70vh] p-0">
                <View className="px-4 pt-4 pb-2">
                    <Text className="text-foreground" style={{ fontSize: 16, fontWeight: '600' }}>
                        {title}
                    </Text>
                </View>

                <ScrollView style={{ maxHeight: 380, paddingVertical: 4 }}>
                    <PickerBody
                        items={items}
                        isLoading={isLoading}
                        extension={extension}
                        isPending={isPending}
                        onPick={onPick}
                    />
                </ScrollView>

                <View className="flex-row justify-end p-3 border-t border-border">
                    <Pressable onPress={onClose} className="px-3 py-2">
                        <Text className="text-foreground" style={{ fontSize: 13 }}>
                            Cancel
                        </Text>
                    </Pressable>
                </View>
            </ModalContent>
        </Modal>
    )
}

function PickerBody({
    items,
    isLoading,
    extension,
    isPending,
    onPick,
}: {
    items: TemplateItem[]
    isLoading: boolean
    extension: TemplateExtension
    isPending: boolean
    onPick: (item: { id: string; name: string }) => void
}) {
    if (isLoading) {
        return (
            <View className="items-center py-10">
                <ActivityIndicator />
            </View>
        )
    }
    if (items.length === 0) {
        return <EmptyState />
    }
    return (
        <>
            {items.map(item => (
                <TemplateRow
                    key={item.id}
                    item={item}
                    extension={extension}
                    isPending={isPending}
                    onPick={onPick}
                />
            ))}
        </>
    )
}

function TemplateRow({
    item,
    extension,
    isPending,
    onPick,
}: {
    item: TemplateItem
    extension: TemplateExtension
    isPending: boolean
    onPick: (item: { id: string; name: string }) => void
}) {
    const displayName = templateDisplayName(item.name, extension)
    return (
        <Pressable
            accessibilityLabel={`Create from template: ${displayName}`}
            disabled={isPending}
            onPress={() => onPick({ id: item.id, name: item.name })}
            className={`flex-row items-center gap-3 px-4 py-2 mx-2 rounded-lg ${isPending ? 'opacity-50' : ''}`}
        >
            <CoreThumbnail source={templateSource(item)} size={40} />
            <View className="flex-1">
                <Text numberOfLines={1} className="text-foreground text-[14px] font-medium">
                    {displayName}
                </Text>
                <Text className="text-muted-foreground text-[12px]">
                    {formatRelativeDate(item.updated)}
                </Text>
            </View>
        </Pressable>
    )
}

function EmptyState() {
    return (
        <View className="items-center px-6 py-10">
            <Text className="text-foreground text-[14px] font-medium text-center">
                No templates yet
            </Text>
            <Text className="text-muted-foreground text-[13px] text-center mt-1">
                Use “Export as template” from a document’s File menu to create one.
            </Text>
        </View>
    )
}

const DRIVE_ITEMS_COLLECTION = 'drive_items'

// Build the FilePreviewSource the core Thumbnail needs. The mime is left
// empty so the Thumbnail falls back to a generic file icon when a row has
// no rendered thumbnail yet (freshly-exported templates).
function templateSource(item: TemplateItem): FilePreviewSource {
    return {
        collectionId: DRIVE_ITEMS_COLLECTION,
        recordId: item.id,
        fileName: item.file,
        displayName: item.name,
        mimeType: '',
        size: item.size,
        thumbnailFileName: item.thumbnail || undefined,
    }
}
