import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { formatBytes } from '@tinycld/core/lib/format-utils'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { File, X } from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, Text, View } from 'react-native'
import type { DriveItemView } from '../types'

interface UploadingListRowProps {
    item: DriveItemView
    onDismiss: (id: string) => void
}

export function UploadingListRow({ item, onDismiss }: UploadingListRowProps) {
    const isMobile = useBreakpoint() === 'mobile'
    const indicatorColor = useThemeColor('active-indicator')
    const dangerColor = useThemeColor('danger')
    const mutedColor = useThemeColor('muted-foreground')

    const status = item.uploadStatus ?? 'pending'
    const isError = status === 'error'
    const isIndeterminate = (status === 'pending' || status === 'uploading') && (item.uploadLoaded ?? 0) === 0
    const progress = item.size > 0 ? Math.min(1, (item.uploadLoaded ?? 0) / item.size) : 0

    const fillColor = isError ? `${dangerColor}1F` : `${indicatorColor}1F`
    const trailingText = describeStatus(status, item.uploadLoaded ?? 0, item.size, item.uploadError)

    return (
        <View
            className="relative border-b border-border bg-background overflow-hidden"
            accessibilityRole="progressbar"
            accessibilityLabel={`Uploading ${item.name}`}
            accessibilityValue={{ now: Math.round(progress * 100), min: 0, max: 100 }}
        >
            {isIndeterminate ? (
                <IndeterminateBar color={fillColor} />
            ) : (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: `${progress * 100}%`,
                        backgroundColor: fillColor,
                    }}
                />
            )}
            {isMobile ? (
                <View className="flex-row items-center px-4 py-3 gap-3">
                    <View
                        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <File size={24} color={mutedColor} />
                    </View>
                    <View className="flex-1 gap-0.5">
                        <Text
                            numberOfLines={1}
                            className="text-foreground"
                            style={{ fontSize: 16, fontWeight: '500' }}
                        >
                            {item.name}
                        </Text>
                        <Text
                            numberOfLines={1}
                            className={isError ? 'text-danger' : 'text-muted-foreground'}
                            style={{ fontSize: 12 }}
                        >
                            {trailingText}
                        </Text>
                    </View>
                    {isError && <DismissButton onPress={() => onDismiss(item.id)} />}
                </View>
            ) : (
                <View className="flex-row items-center px-3 py-2.5">
                    <View className="flex-row items-center" style={{ gap: 10, flex: 3 }}>
                        <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                            <File size={20} color={mutedColor} />
                        </View>
                        <Text
                            numberOfLines={1}
                            className="flex-1 text-foreground"
                            style={{ fontSize: 13, fontWeight: '500' }}
                        >
                            {item.name}
                        </Text>
                    </View>
                    <Text
                        numberOfLines={1}
                        className={isError ? 'text-danger' : 'text-muted-foreground'}
                        style={{ fontSize: 12, flex: 2 }}
                    >
                        {trailingText}
                    </Text>
                    <View style={{ flex: 2 }} />
                    <Text className="text-muted-foreground" style={{ fontSize: 12, flex: 1 }}>
                        {formatBytes(item.size)}
                    </Text>
                    <View style={{ width: 80, alignItems: 'flex-end' }}>
                        {isError && <DismissButton onPress={() => onDismiss(item.id)} />}
                    </View>
                </View>
            )}
        </View>
    )
}

function DismissButton({ onPress }: { onPress: () => void }) {
    const dangerColor = useThemeColor('danger')
    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="Dismiss failed upload"
            style={{ padding: 4 }}
            hitSlop={8}
        >
            <X size={16} color={dangerColor} />
        </Pressable>
    )
}

function describeStatus(
    status: 'pending' | 'uploading' | 'done' | 'error',
    loaded: number,
    size: number,
    errorMessage?: string
): string {
    if (status === 'error') return errorMessage ? `Failed — ${errorMessage}` : 'Upload failed'
    if (status === 'done') return 'Uploaded'
    if (status === 'pending') return 'Queued'
    if (size === 0) return 'Uploading…'
    return `${formatBytes(loaded)} of ${formatBytes(size)}`
}

function IndeterminateBar({ color }: { color: string }) {
    const anim = useRef(new Animated.Value(0)).current
    useEffect(() => {
        const loop = Animated.loop(
            Animated.timing(anim, {
                toValue: 1,
                duration: 1400,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: false,
            })
        )
        loop.start()
        return () => loop.stop()
    }, [anim])

    const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: ['-40%', '110%'] })

    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                overflow: 'hidden',
            }}
        >
            <Animated.View
                style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    width: '40%',
                    backgroundColor: color,
                    transform: [{ translateX }],
                }}
            />
        </View>
    )
}
