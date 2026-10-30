import { useForm, z, zodResolver } from '@tinycld/core/ui/form'
import { useRef } from 'react'
import type { TextInputInstance, TextInputKeyPressEvent } from 'react-native'

// An empty label removes it; 500 is drive_item_versions.label's max.
export const versionLabelSchema = z.object({ label: z.string().trim().max(500) })

interface Options {
    label: string
    onSave: (label: string) => void
    onDone: () => void
}

// The in-place label edit on the active version row. Enter or Save saves;
// Escape or Cancel leaves it. No save on blur: pressing Cancel blurs the
// field first.
export function useVersionLabelEditor({ label, onSave, onDone }: Options) {
    const inputRef = useRef<TextInputInstance>(null)
    const {
        control,
        handleSubmit,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(versionLabelSchema),
        defaultValues: { label },
    })

    const save = handleSubmit(
        data => {
            if (data.label !== label) onSave(data.label)
            onDone()
        },
        () => inputRef.current?.focus()
    )

    const handleKeyPress = (event: TextInputKeyPressEvent) => {
        if (event.nativeEvent.key === 'Escape') onDone()
    }

    return { control, inputRef, save, handleKeyPress, errorMessage: errors.label?.message }
}
