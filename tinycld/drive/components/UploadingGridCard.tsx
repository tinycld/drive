import { formatBytes } from '@tinycld/core/lib/format-utils'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { File, X } from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, Text, View } from 'react-native'
import type { DriveItemView } from '../types'

const THUMB_HEIGHT = 120

interface UploadingGridCardProps {
    item: DriveItemView
    onDismiss: (id: string) => void
}

export function UploadingGridCard({ item, onDismiss }: UploadingGridCardProps) {
    const indicatorColor = useThemeColor('active-indicator')
    const dangerColor = useThemeColor('danger')
    const mutedColor = useThemeColor('muted-foreground')

    const status = item.uploadStatus ?? 'pending'
    const isError = status === 'error'
    const isIndeterminate = (status === 'pending' || status === 'uploading') && (item.uploadLoaded ?? 0) === 0
    const progress = item.size > 0 ? Math.min(1, (item.uploadLoaded ?? 0) / item.size) : 0

    const fillColor = isError ? `${dangerColor}26` : `${indicatorColor}26`
    const fillHeight = Math.round(progress * THUMB_HEIGHT)

    return (
        <View className="rounded-lg overflow-hidden border border-border">
            <View className="flex-row items-center gap-2 px-2.5 py-2 border-b border-border">
                <File size={18} color={mutedColor} />
                <Text numberOfLines={1} className="flex-1 text-xs font-medium text-foreground">
                    {item.name}
                </Text>
                {isError && (
                    <Pressable
                        onPress={() => onDismiss(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss failed upload"
                        style={{ padding: 2 }}
                        hitSlop={8}
                    >
                        <X size={14} color={dangerColor} />
                    </Pressable>
                )}
            </View>
            <View
                className="items-center justify-center bg-muted-foreground/5"
                style={{ height: THUMB_HEIGHT, position: 'relative' }}
                accessibilityRole="progressbar"
                accessibilityLabel={`Uploading ${item.name}`}
                accessibilityValue={{ now: Math.round(progress * 100), min: 0, max: 100 }}
            >
                <File size={48} color={mutedColor} />
                {isIndeterminate ? (
                    <IndeterminateThumbFill color={fillColor} />
                ) : (
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            height: fillHeight,
                            backgroundColor: fillColor,
                        }}
                    />
                )}
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        bottom: 6,
                        left: 0,
                        right: 0,
                        alignItems: 'center',
                    }}
                >
                    <Text
                        className={isError ? 'text-danger' : 'text-foreground'}
                        style={{ fontSize: 11, fontWeight: '500' }}
                    >
                        {describeStatus(status, item.uploadLoaded ?? 0, item.size, item.uploadError)}
                    </Text>
                </View>
            </View>
        </View>
    )
}

function describeStatus(
    status: 'pending' | 'uploading' | 'done' | 'error',
    loaded: number,
    size: number,
    errorMessage?: string
): string {
    if (status === 'error') return errorMessage ? 'Failed' : 'Upload failed'
    if (status === 'done') return 'Uploaded'
    if (status === 'pending') return 'Queued'
    if (size === 0) return 'Uploading…'
    const pct = Math.round(Math.min(1, loaded / size) * 100)
    return `${pct}% · ${formatBytes(loaded)} of ${formatBytes(size)}`
}

function IndeterminateThumbFill({ color }: { color: string }) {
    const anim = useRef(new Animated.Value(0)).current
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(anim, {
                    toValue: 1,
                    duration: 1100,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                }),
                Animated.timing(anim, {
                    toValue: 0,
                    duration: 1100,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                }),
            ])
        )
        loop.start()
        return () => loop.stop()
    }, [anim])

    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] })
    const height = anim.interpolate({ inputRange: [0, 1], outputRange: [12, 28] })

    return (
        <Animated.View
            pointerEvents="none"
            style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height,
                backgroundColor: color,
                opacity,
            }}
        />
    )
}
