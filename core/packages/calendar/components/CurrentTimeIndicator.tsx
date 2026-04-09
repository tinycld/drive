import { View, XStack } from 'tamagui'

interface CurrentTimeIndicatorProps {
    topOffset: number
}

export function CurrentTimeIndicator({ topOffset }: CurrentTimeIndicatorProps) {
    return (
        <XStack
            position="absolute"
            top={topOffset}
            left={0}
            right={0}
            alignItems="center"
            zIndex={10}
            pointerEvents="none"
        >
            <View width={10} height={10} borderRadius={5} backgroundColor="$red8" marginLeft={-5} />
            <View flex={1} height={2} backgroundColor="$red8" />
        </XStack>
    )
}
