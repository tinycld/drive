import type { ReactNode } from 'react'
import { useState } from 'react'
import { Platform, View } from 'react-native'
import { Text, useTheme } from 'tamagui'

interface DropZoneProps {
    children: ReactNode
    onDrop: (files: File[]) => void
    isEnabled: boolean
}

export function DropZone({ children, onDrop, isEnabled }: DropZoneProps) {
    const [isDragging, setIsDragging] = useState(false)
    const theme = useTheme()

    if (Platform.OS !== 'web') {
        return <View style={{ flex: 1 }}>{children}</View>
    }

    const handleDragEnter = (e: React.DragEvent) => {
        if (!isEnabled) return
        e.preventDefault()
        e.stopPropagation()
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragging(true)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        if (!isEnabled) return
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDragLeave = (e: React.DragEvent) => {
        if (!isEnabled) return
        e.preventDefault()
        e.stopPropagation()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const { clientX, clientY } = e
        if (
            clientX <= rect.left ||
            clientX >= rect.right ||
            clientY <= rect.top ||
            clientY >= rect.bottom
        ) {
            setIsDragging(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        if (!isEnabled) return
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) {
            onDrop(files)
        }
    }

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop zone requires native DOM events
        <div
            role="presentation"
            style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {children}
            {isDragging && isEnabled && (
                <View
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: `${theme.accentBackground.val}15`,
                        borderWidth: 2,
                        borderStyle: 'dashed',
                        borderColor: theme.accentBackground.val,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 100,
                    }}
                >
                    <Text color="$accentBackground" fontSize="$5" fontWeight="600">
                        Drop files to upload
                    </Text>
                </View>
            )}
        </div>
    )
}
