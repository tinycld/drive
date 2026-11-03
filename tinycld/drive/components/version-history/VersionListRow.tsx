import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Controller } from '@tinycld/core/ui/form'
import { useState } from 'react'
import { type GestureResponderEvent, Pressable, Text, TextInput, View } from 'react-native'
import type { VersionRow } from '../../hooks/useVersionHistory'
import { useVersionLabelEditor } from '../../hooks/useVersionLabelEditor'
import { VersionPeople } from './VersionPeople'
import { versionPeople, versionRowText } from './version-row-text'

interface VersionListRowProps {
    version: VersionRow
    isSelected: boolean
    isBase: boolean
    // Rename and Restore show on the active row only, for users who can edit.
    isActionsVisible: boolean
    isRestoring: boolean
    onSelect: (versionId: string) => void
    onPickBase: (versionId: string) => void
    onRename: (label: string) => void
    onRestore: () => void
}

// ⌘-click (Ctrl-click off Mac) on web. Native has no modifier keys; there a
// long-press picks the base.
function hasCompareModifier(event: GestureResponderEvent) {
    const native = event.nativeEvent as { metaKey?: boolean; ctrlKey?: boolean }
    return !!(native.metaKey || native.ctrlKey)
}

export function VersionListRow({
    version,
    isSelected,
    isBase,
    isActionsVisible,
    isRestoring,
    onSelect,
    onPickBase,
    onRename,
    onRestore,
}: VersionListRowProps) {
    const { title, time, badge } = versionRowText(version)
    const people = versionPeople(version)
    const rowClass = isSelected ? 'bg-accent' : 'bg-background'
    const baseClass = isBase ? 'border-l-4 border-l-primary' : ''
    const subtitle = version.label ? time : ''
    // Room on the title line for the actions, which sit over its right end.
    const titleSpace = isActionsVisible ? 'pr-32' : ''
    const press = (event: GestureResponderEvent) =>
        hasCompareModifier(event) ? onPickBase(version.id) : onSelect(version.id)
    // Local to the row; it ends when the row stops being the active one.
    const [isEditingState, setEditing] = useState(false)
    const isEditing = isEditingState && isActionsVisible

    if (isEditing) {
        return (
            <EditingRow
                label={version.label}
                subtitle={time}
                badge={badge}
                people={people}
                onSave={onRename}
                onDone={() => setEditing(false)}
                rowClass={`${rowClass} ${baseClass}`}
            />
        )
    }

    // The click target and the actions are siblings: on web the target is a
    // <button>, and a button cannot hold the Rename and Restore buttons.
    return (
        <View className={`border-b border-border ${rowClass} ${baseClass}`}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={title}
                accessibilityState={{ selected: isSelected }}
                accessibilityHint="⌘-click or long-press to compare with this version"
                onPress={press}
                onLongPress={() => onPickBase(version.id)}
                className="px-4 py-3"
            >
                <View className="flex-row items-center gap-2">
                    <Text
                        className={`flex-1 text-sm font-medium text-foreground ${titleSpace}`}
                        numberOfLines={1}
                    >
                        {title}
                    </Text>
                    <BaseBadge isVisible={isBase} />
                </View>
                <SubtitleLine text={subtitle} />
                <View className="flex-row items-end justify-between gap-2">
                    <View className="flex-1">
                        <VersionPeople userIds={people.userIds} shareNames={people.shareNames} />
                    </View>
                    <Text className="text-xs text-muted-foreground">{badge}</Text>
                </View>
            </Pressable>
            <RowActions
                isVisible={isActionsVisible}
                isRestoring={isRestoring}
                onRename={() => setEditing(true)}
                onRestore={onRestore}
            />
        </View>
    )
}

interface EditingRowProps {
    label: string
    subtitle: string
    badge: string
    people: ReturnType<typeof versionPeople>
    onSave: (label: string) => void
    onDone: () => void
    rowClass: string
}

// The active row while its label is edited: the title is a field, and the
// actions are Save and Cancel. Not a click target, so the field and the
// buttons are not inside a button.
function EditingRow({ label, subtitle, badge, people, onSave, onDone, rowClass }: EditingRowProps) {
    const editor = useVersionLabelEditor({ label, onSave, onDone })
    const fg = useThemeColor('foreground')
    return (
        <View className={`border-b border-border px-4 py-3 ${rowClass}`}>
            <Controller
                control={editor.control}
                name="label"
                render={({ field }) => (
                    <TextInput
                        ref={editor.inputRef}
                        value={field.value}
                        onChangeText={field.onChange}
                        autoFocus
                        selectTextOnFocus
                        maxLength={500}
                        placeholder="Version name"
                        onSubmitEditing={() => editor.save()}
                        onKeyPress={editor.handleKeyPress}
                        returnKeyType="done"
                        accessibilityLabel="Version name"
                        className="mr-32 rounded-md border border-border bg-field-background px-2 py-0.5 text-sm"
                        style={{ color: fg }}
                    />
                )}
            />
            <InlineError message={editor.errorMessage} />
            <SubtitleLine text={subtitle} />
            <View className="flex-row items-end justify-between gap-2">
                <View className="flex-1">
                    <VersionPeople userIds={people.userIds} shareNames={people.shareNames} />
                </View>
                <Text className="text-xs text-muted-foreground">{badge}</Text>
            </View>
            <View className="absolute right-3 top-2.5 flex-row gap-1">
                <RowActionButton
                    label="Save"
                    onPress={() => editor.save()}
                    isPrimary
                    isDisabled={false}
                />
                <RowActionButton
                    label="Cancel"
                    onPress={onDone}
                    isPrimary={false}
                    isDisabled={false}
                />
            </View>
        </View>
    )
}

function InlineError({ message }: { message: string | undefined }) {
    if (!message) return null
    return <Text className="mt-1 text-xs text-danger">{message}</Text>
}

function SubtitleLine({ text }: { text: string }) {
    if (!text) return null
    return <Text className="text-xs text-muted-foreground">{text}</Text>
}

function BaseBadge({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Text className="text-xs font-medium text-primary">Compared</Text>
}

function RowActions({
    isVisible,
    isRestoring,
    onRename,
    onRestore,
}: {
    isVisible: boolean
    isRestoring: boolean
    onRename: () => void
    onRestore: () => void
}) {
    if (!isVisible) return null
    return (
        <View className="absolute right-3 top-2.5 flex-row gap-1">
            <RowActionButton
                label="Rename"
                onPress={onRename}
                isPrimary={false}
                isDisabled={false}
            />
            <RowActionButton
                label="Restore"
                onPress={onRestore}
                isPrimary
                isDisabled={isRestoring}
            />
        </View>
    )
}

// Compact enough to fit on the title line of a two-line row; the standard
// small Button is taller than that line and covers the source tag below.
function RowActionButton({
    label,
    onPress,
    isPrimary,
    isDisabled,
}: {
    label: string
    onPress: () => void
    isPrimary: boolean
    isDisabled: boolean
}) {
    const boxClass = isPrimary ? 'border-primary bg-primary' : 'border-border bg-background'
    const textClass = isPrimary ? 'text-primary-foreground' : 'text-foreground'
    const disabledClass = isDisabled ? 'opacity-40' : ''
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: isDisabled }}
            disabled={isDisabled}
            onPress={onPress}
            className={`rounded border px-2 py-0.5 ${boxClass} ${disabledClass}`}
        >
            <Text className={`text-xs font-medium ${textClass}`}>{label}</Text>
        </Pressable>
    )
}
