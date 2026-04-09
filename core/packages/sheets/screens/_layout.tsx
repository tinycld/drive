import { Slot } from 'one'
import { YStack } from 'tamagui'
import SheetsProvider from '../provider'

export default function SheetsLayout() {
    return (
        <SheetsProvider>
            <YStack flex={1} backgroundColor="$background">
                <Slot />
            </YStack>
        </SheetsProvider>
    )
}
