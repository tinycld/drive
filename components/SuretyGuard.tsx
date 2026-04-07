import type { ReactNode } from 'react'
import { useState } from 'react'
import { Platform, View } from 'react-native'
import { Button, Popover, SizableText, XStack, YStack } from 'tamagui'

const webShadow =
    Platform.OS === 'web'
        ? ({ boxShadow: '0 4px 16px rgba(0,0,0,0.18)' } as Record<string, unknown>)
        : {}

interface SuretyGuardProps {
    children: (onOpen: () => void) => ReactNode
    message?: string
    confirmLabel?: string
    onConfirmed: () => void | Promise<void>
}

export function SuretyGuard({
    children,
    message = 'Are you sure? This cannot be undone.',
    confirmLabel = 'Yes',
    onConfirmed,
}: SuretyGuardProps) {
    const [open, setOpen] = useState(false)
    const [pending, setPending] = useState(false)

    const handleConfirm = async () => {
        setPending(true)
        try {
            await onConfirmed()
        } finally {
            setPending(false)
            setOpen(false)
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen} placement="bottom" offset={4}>
            <Popover.Anchor>
                <View>{children(() => setOpen(true))}</View>
            </Popover.Anchor>
            <Popover.Content
                padding="$3"
                width={280}
                backgroundColor="$background"
                borderColor="$borderColor"
                borderWidth={1}
                borderRadius={8}
                style={webShadow}
            >
                <Popover.Arrow backgroundColor="$background" borderColor="$borderColor" />
                <YStack gap="$3">
                    <SizableText size="$3">{message}</SizableText>
                    <XStack gap="$3" justifyContent="flex-end">
                        <Button
                            size="$3"
                            chromeless
                            disabled={pending}
                            onPress={() => setOpen(false)}
                        >
                            <Button.Text>Cancel</Button.Text>
                        </Button>
                        <Button
                            size="$3"
                            theme="red"
                            onPress={handleConfirm}
                            disabled={pending}
                            opacity={pending ? 0.6 : 1}
                        >
                            <Button.Text fontWeight="600">{confirmLabel}</Button.Text>
                        </Button>
                    </XStack>
                </YStack>
            </Popover.Content>
        </Popover>
    )
}

interface ConfirmTrashProps {
    children: (onOpen: () => void) => ReactNode
    itemName: string
    onConfirmed: () => void | Promise<void>
}

export function ConfirmTrash({ children, itemName, onConfirmed }: ConfirmTrashProps) {
    return (
        <SuretyGuard
            message={`Are you sure you want to move "${itemName}" to trash? It will be permanently removed after 30 days.`}
            confirmLabel="Move to trash"
            onConfirmed={onConfirmed}
        >
            {children}
        </SuretyGuard>
    )
}
