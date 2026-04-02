import { type Control, type FieldValues, type Path, useController } from 'react-hook-form'
import { TextInput as RNTextInput } from 'react-native'
import { Button, SizableText, XStack, YStack, useTheme, type YStackProps } from 'tamagui'

export type NumberInputProps<T extends FieldValues = Record<string, unknown>> = {
    name: Path<T>
    control: Control<T>
    label?: string
    hint?: string
    increment?: number
    min?: number
    max?: number
    disabled?: boolean
    wrapperProps?: YStackProps
}

export function NumberInput<T extends FieldValues = Record<string, unknown>>({
    name,
    control,
    label,
    hint,
    increment = 1,
    min,
    max,
    disabled = false,
    wrapperProps = {},
}: NumberInputProps<T>) {
    const theme = useTheme()
    const {
        field,
        fieldState: { error },
    } = useController({ name, control })

    const hasError = !!error

    const handleTextChange = (text: string) => {
        if (text === '' || text === '-') {
            field.onChange(text)
            return
        }
        const digitsOnly = text.replace(/[^0-9-]/g, '')
        if (digitsOnly !== text) return

        const numValue = Number.parseInt(digitsOnly, 10)
        if (Number.isNaN(numValue)) return
        if (min !== undefined && numValue < min) return
        if (max !== undefined && numValue > max) return
        field.onChange(numValue)
    }

    const handleIncrement = () => {
        const current = typeof field.value === 'number' ? field.value : 0
        const next = current + increment
        if (max === undefined || next <= max) field.onChange(next)
    }

    const handleDecrement = () => {
        const current = typeof field.value === 'number' ? field.value : 0
        const next = current - increment
        if (min === undefined || next >= min) field.onChange(next)
    }

    const displayValue =
        field.value === '' || field.value === '-' ? field.value : String(field.value ?? '')

    const canDecrement = !disabled && (min === undefined || field.value > min)
    const canIncrement = !disabled && (max === undefined || field.value < max)

    return (
        <YStack gap="$1.5" marginBottom="$3" {...wrapperProps}>
            {label ? (
                <SizableText size="$3" fontWeight="600" color="$color">
                    {label}
                </SizableText>
            ) : null}
            <XStack alignItems="center" gap="$2">
                <Button
                    size="$4"
                    onPress={handleDecrement}
                    disabled={!canDecrement}
                    opacity={canDecrement ? 1 : 0.4}
                >
                    <Button.Text size="$5" fontWeight="600">−</Button.Text>
                </Button>
                <RNTextInput
                    value={displayValue}
                    onChangeText={handleTextChange}
                    onBlur={field.onBlur}
                    keyboardType="numeric"
                    editable={!disabled}
                    accessibilityLabel={label}
                    testID={name}
                    placeholderTextColor={theme.placeholderColor.val}
                    style={{
                        flex: 1,
                        borderWidth: 1,
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        fontSize: 16,
                        textAlign: 'center',
                        color: theme.color.val,
                        backgroundColor: theme.background.val,
                        borderColor: hasError ? theme.red8.val : theme.borderColor.val,
                    }}
                />
                <Button
                    size="$4"
                    onPress={handleIncrement}
                    disabled={!canIncrement}
                    opacity={canIncrement ? 1 : 0.4}
                >
                    <Button.Text size="$5" fontWeight="600">+</Button.Text>
                </Button>
            </XStack>
            {hint && !hasError ? (
                <SizableText size="$2" color="$color8">
                    {hint}
                </SizableText>
            ) : null}
            {hasError ? (
                <SizableText size="$2" color="$red8">
                    {error.message}
                </SizableText>
            ) : null}
        </YStack>
    )
}
