import { type Control, type FieldValues, type Path, useController } from 'react-hook-form'
import { Switch } from 'react-native'
import { SizableText, XStack, YStack, useTheme, type YStackProps } from 'tamagui'

export type ToggleProps<T extends FieldValues = Record<string, unknown>> = {
    name: Path<T>
    control: Control<T>
    label: string
    hint?: string
    disabled?: boolean
    wrapperProps?: YStackProps
}

export function Toggle<T extends FieldValues = Record<string, unknown>>({
    name,
    control,
    label,
    hint,
    disabled = false,
    wrapperProps = {},
}: ToggleProps<T>) {
    const theme = useTheme()
    const {
        field,
        fieldState: { error },
    } = useController({ name, control })

    const hasError = !!error

    return (
        <YStack gap="$1.5" marginBottom="$3" {...wrapperProps}>
            <XStack alignItems="center" justifyContent="space-between" gap="$2">
                <SizableText size="$3" fontWeight="600" color="$color">
                    {label}
                </SizableText>
                <Switch
                    value={Boolean(field.value)}
                    onValueChange={field.onChange}
                    disabled={disabled}
                    accessibilityLabel={label}
                    trackColor={{ false: theme.borderColor.val, true: theme.accentBackground.val }}
                />
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
