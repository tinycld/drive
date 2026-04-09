import { Slot } from 'one'
import { YStack } from 'tamagui'

export default function DocumentsLayout() {
    return (
        <YStack flex={1} backgroundColor="$background">
            <Slot />
        </YStack>
    )
}
