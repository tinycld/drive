import { useThemeColor } from 'heroui-native'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native'
import { getFileURL } from '../../lib/file-url'
import type { PreviewProps } from '../../lib/preview-registry'

export function CodePreview({ item }: PreviewProps) {
    const [content, setContent] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [fgColor, mutedColor] = useThemeColor(['foreground', 'muted'])
    const fileUrl = getFileURL(item)

    const loadContent = useCallback(async () => {
        if (!fileUrl || Platform.OS !== 'web') {
            setLoading(false)
            return
        }
        try {
            const resp = await fetch(fileUrl)
            const text = await resp.text()
            setContent(text.slice(0, 100_000))
        } catch {
            setContent('Failed to load file content')
        } finally {
            setLoading(false)
        }
    }, [fileUrl])

    useEffect(() => {
        loadContent()
    }, [loadContent])

    if (loading) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator />
            </View>
        )
    }

    if (content === null) {
        return (
            <View
                style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                }}
            >
                <Text style={{ color: mutedColor }}>Cannot preview this file</Text>
            </View>
        )
    }

    return (
        <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={{ fontSize: 13, color: fgColor, fontFamily: 'monospace' }}>{content}</Text>
        </ScrollView>
    )
}
