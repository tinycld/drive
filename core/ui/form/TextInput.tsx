import type { ComponentType, ReactNode } from 'react'
import { type Control, type FieldValues, type Path, useController } from 'react-hook-form'
import type { TextInputProps as RNTextInputProps } from 'react-native'
import { Input, SizableText, useTheme, XStack, YStack, type YStackProps } from 'tamagui'

function LabelRow({
    label,
    icon: Icon,
}: {
    label: string
    icon?: ComponentType<{ size: number; color: string }>
}) {
    const theme = useTheme()
    if (!Icon) {
        return (
            <SizableText size="$3" fontWeight="600" color="$color">
                {label}
            </SizableText>
        )
    }
    return (
        <XStack gap="$2" alignItems="center">
            <Icon size={16} color={theme.color8.val} />
            <SizableText size="$3" fontWeight="600" color="$color">
                {label}
            </SizableText>
        </XStack>
    )
}

export type TextInputProps<T extends FieldValues = Record<string, unknown>> = Omit<
    RNTextInputProps,
    'value' | 'onChangeText' | 'onBlur'
> & {
    name: Path<T>
    control: Control<T>
    rules?: Record<string, unknown>
    label?: string
    labelIcon?: ComponentType<{ size: number; color: string }>
    hint?: string
    wrapperProps?: YStackProps
    addon?: ReactNode
}

export function TextInput<T extends FieldValues = Record<string, unknown>>(
    props: TextInputProps<T>
) {
    const {
        label,
        labelIcon: LabelIcon,
        hint,
        name,
        control,
        rules,
        wrapperProps = {},
        addon,
        ...inputProps
    } = props
    const {
        field,
        fieldState: { error },
    } = useController({ name, control, rules })

    const hasError = !!error

    return (
        <YStack gap="$1.5" marginBottom="$3" {...wrapperProps}>
            {label ? <LabelRow label={label} icon={LabelIcon} /> : null}
            <XStack gap="$2" alignItems="center">
                <Input
                    size="$4"
                    flex={1}
                    value={field.value || ''}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    accessibilityLabel={label}
                    testID={name}
                    placeholder={inputProps.placeholder}
                    autoFocus={inputProps.autoFocus}
                    keyboardType={inputProps.keyboardType}
                    autoCapitalize={inputProps.autoCapitalize}
                    secureTextEntry={inputProps.secureTextEntry}
                    placeholderTextColor="$placeholderColor"
                    borderColor={hasError ? '$red8' : '$borderColor'}
                    backgroundColor="$background"
                    color="$color"
                />
                {addon}
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
