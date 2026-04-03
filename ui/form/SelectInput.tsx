import { type Control, type FieldValues, type Path, useController } from 'react-hook-form'
import { Button, SizableText, XStack, YStack, type YStackProps } from 'tamagui'

export type SelectOption = {
    label: string
    value: string
}

export type SelectInputProps<T extends FieldValues = Record<string, unknown>> = {
    name: Path<T>
    control: Control<T>
    label: string
    options: SelectOption[]
    hint?: string
    horizontal?: boolean
    wrapperProps?: YStackProps
}

export function SelectInput<T extends FieldValues = Record<string, unknown>>({
    name,
    control,
    label,
    options,
    hint,
    horizontal = false,
    wrapperProps = {},
}: SelectInputProps<T>) {
    const {
        field,
        fieldState: { error },
    } = useController({ name, control })

    const hasError = !!error
    const Container = horizontal ? XStack : YStack

    return (
        <YStack gap="$1.5" marginBottom="$3" {...wrapperProps}>
            {label ? (
                <SizableText size="$3" fontWeight="600" color="$color">
                    {label}
                </SizableText>
            ) : null}
            <Container gap={horizontal ? '$2' : '$1'} flexWrap={horizontal ? 'wrap' : undefined}>
                {options.map(option => {
                    const isSelected = field.value === option.value
                    return (
                        <Button
                            key={option.value}
                            onPress={() => field.onChange(option.value)}
                            theme={isSelected ? 'accent' : undefined}
                            borderColor={isSelected ? '$accentBackground' : '$borderColor'}
                            borderWidth={1}
                            borderRadius="$3"
                            paddingVertical="$2"
                            paddingHorizontal="$4"
                            flex={horizontal ? 1 : undefined}
                            minWidth={horizontal ? 80 : undefined}
                        >
                            <Button.Text size="$3" fontWeight="500">
                                {option.label}
                            </Button.Text>
                        </Button>
                    )
                })}
            </Container>
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
