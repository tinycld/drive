import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { type Href, Link } from 'expo-router'
import { Clock, FolderOpen, type LucideIcon, Plus, Upload } from 'lucide-react-native'
import { useCallback } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'

interface NoFilePanelProps {
    /** Large display headline above the CTA row (e.g. 'A fresh sheet.'). */
    headline: string
    /** Small uppercase tagline beneath the headline. */
    sublabel: string
    /** Label on the "create new" CTA (e.g. 'New sheet'). */
    newLabel: string
    /** Short hint underneath the Upload CTA (e.g. '.xlsx, .csv'). */
    uploadHint: string
    /**
     * `accept` attribute for the file picker — comma-separated list of
     * extensions and MIME types. Same format `<input type="file" accept>`
     * understands on web.
     */
    accept: string
    onCreateNew: () => void
    onUpload: (files: File[]) => void
    /** Disables Create + Upload while a mutation is in flight. */
    isPending?: boolean
}

/**
 * Drive-owned landing panel for "file editor" packages (calc, text) when
 * no file is open. Renders three CTA cards: create-new, upload (with a
 * package-supplied accept list), and Browse — which links into drive's
 * Recent and root views.
 *
 * The component is purely presentational: all package-identity strings
 * are props. Drive owns it because the Browse Recent / Browse All links
 * are drive routes, so the consumer doesn't need to know how to build
 * those hrefs.
 */
export function NoFilePanel({
    headline,
    sublabel,
    newLabel,
    uploadHint,
    accept,
    onCreateNew,
    onUpload,
    isPending = false,
}: NoFilePanelProps) {
    const orgHref = useOrgHref()
    const dividerColor = useThemeColor('muted-foreground')

    return (
        <View className="flex-1 items-center justify-center bg-background px-8 py-16">
            <View className="w-full max-w-3xl items-center gap-10">
                <View className="items-center gap-5">
                    <Text
                        accessibilityRole="header"
                        aria-level={1}
                        className="text-5xl font-light tracking-tight text-foreground"
                    >
                        {headline}
                    </Text>
                    <View
                        className="h-px w-16 opacity-30"
                        style={{ backgroundColor: dividerColor }}
                    />
                    <Text className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        {sublabel}
                    </Text>
                </View>

                <View className="w-full flex-row flex-wrap justify-center gap-4">
                    <CtaCard
                        Icon={Plus}
                        label={newLabel}
                        hint={isPending ? 'Creating…' : 'Start blank'}
                        onPress={onCreateNew}
                        disabled={isPending}
                    />
                    <UploadCard
                        hint={uploadHint}
                        accept={accept}
                        onPick={onUpload}
                        disabled={isPending}
                    />
                    <BrowseCard
                        // Drive's _layout wraps its routes in a <Stack> with
                        // both an index.tsx and a [...path].tsx as sibling
                        // stack entries. When <Link> navigates from outside
                        // drive into this stack with the catch-all object
                        // Href form, Expo Router's state resolution dispatches
                        // to the index screen instead of the catch-all,
                        // silently dropping the rest of the path. Drive
                        // therefore ships a literal /drive/recent route file
                        // (drive/tinycld/drive/screens/recent.tsx) so the
                        // <Link> below resolves to a non-ambiguous named
                        // screen and navigation works as expected. The same
                        // /settings/[...section] pattern works fine from here
                        // because settings has no Stack layout.
                        recentHref={orgHref('drive/recent')}
                        allHref={orgHref('drive')}
                    />
                </View>
            </View>
        </View>
    )
}

interface CtaCardProps {
    Icon: LucideIcon
    label: string
    hint: string
    onPress: () => void
    disabled?: boolean
}

function CtaCard({ Icon, label, hint, onPress, disabled }: CtaCardProps) {
    const iconColor = useThemeColor('foreground')
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            disabled={disabled}
            className="h-40 w-44 justify-between rounded-xl border border-border bg-background p-4 hover:border-foreground/40 disabled:opacity-50"
        >
            <Icon size={22} color={iconColor} />
            <View className="gap-1">
                <Text className="text-base font-medium text-foreground">{label}</Text>
                <Text className="text-xs text-muted-foreground">{hint}</Text>
            </View>
        </Pressable>
    )
}

interface BrowseCardProps {
    recentHref: Href
    allHref: Href
}

// The third card on the No-File panel: a single card matching the
// dimensions of "New" and "Upload" (so the three cards align), but
// internally split into two link rows — Recent and All. Same hairline
// border and hover treatment as the sibling cards.
function BrowseCard({ recentHref, allHref }: BrowseCardProps) {
    const iconColor = useThemeColor('foreground')
    return (
        <View className="h-40 w-44 justify-between rounded-xl border border-border bg-background p-4">
            <FolderOpen size={22} color={iconColor} />
            <View className="gap-1">
                <Text className="text-base font-medium text-foreground">Browse</Text>
                <View className="flex-row items-center gap-3">
                    <BrowseLinkRow Icon={Clock} label="Recent" href={recentHref} />
                    <BrowseLinkRow Icon={FolderOpen} label="All" href={allHref} />
                </View>
            </View>
        </View>
    )
}

interface BrowseLinkRowProps {
    Icon: LucideIcon
    label: string
    href: Href
}

function BrowseLinkRow({ Icon, label, href }: BrowseLinkRowProps) {
    const iconColor = useThemeColor('foreground')
    return (
        <Link href={href} asChild>
            <Pressable
                accessibilityRole="link"
                accessibilityLabel={label}
                className="flex-row items-center gap-2 rounded-md px-1 py-1 hover:bg-foreground/5"
            >
                <Icon size={14} color={iconColor} />
                <Text className="text-sm font-medium text-foreground">{label}</Text>
            </Pressable>
        </Link>
    )
}

interface UploadCardProps {
    hint: string
    accept: string
    onPick: (files: File[]) => void
    disabled?: boolean
}

function UploadCard({ hint, accept, onPick, disabled }: UploadCardProps) {
    const iconColor = useThemeColor('foreground')

    const handleWebChange = useCallback(
        (event: { target: HTMLInputElement }) => {
            const list = event.target.files
            if (!list || list.length === 0) return
            const files = Array.from(list)
            // Allow re-picking the same file by clearing the input value.
            event.target.value = ''
            onPick(files)
        },
        [onPick]
    )

    const handleNativePress = useCallback(async () => {
        // Native uses expo-document-picker; the picker doesn't return web
        // File objects, so we surface a single-file path through the same
        // onPick contract using a Blob shim. The consumer's handler maps
        // it back to the native body shape via FormData on the create call.
        const picker = await import('expo-document-picker')
        const result = await picker.getDocumentAsync({
            type: accept
                .split(',')
                .map(s => s.trim())
                .filter(s => s.includes('/')),
            multiple: true,
            copyToCacheDirectory: true,
        })
        if (result.canceled) return
        const assets = result.assets ?? []
        if (assets.length === 0) return
        const files = assets.map(
            a =>
                ({
                    name: a.name ?? 'file',
                    uri: a.uri,
                    type: a.mimeType ?? 'application/octet-stream',
                    size: a.size ?? 0,
                }) as unknown as File
        )
        onPick(files)
    }, [accept, onPick])

    if (Platform.OS === 'web') {
        return (
            <View className="h-40 w-44">
                <label
                    style={{
                        display: 'flex',
                        height: '100%',
                        width: '100%',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.5 : 1,
                    }}
                >
                    <View className="h-40 w-44 justify-between rounded-xl border border-border bg-background p-4 hover:border-foreground/40">
                        <Upload size={22} color={iconColor} />
                        <View className="gap-1">
                            <Text className="text-base font-medium text-foreground">
                                Upload files
                            </Text>
                            <Text className="text-xs text-muted-foreground">{hint}</Text>
                        </View>
                    </View>
                    <input
                        type="file"
                        multiple
                        accept={accept}
                        onChange={
                            handleWebChange as unknown as React.ChangeEventHandler<HTMLInputElement>
                        }
                        disabled={disabled}
                        style={{ display: 'none' }}
                    />
                </label>
            </View>
        )
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload files"
            onPress={handleNativePress}
            disabled={disabled}
            className="h-40 w-44 justify-between rounded-xl border border-border bg-background p-4 hover:border-foreground/40 disabled:opacity-50"
        >
            <Upload size={22} color={iconColor} />
            <View className="gap-1">
                <Text className="text-base font-medium text-foreground">Upload files</Text>
                <Text className="text-xs text-muted-foreground">{hint}</Text>
            </View>
        </Pressable>
    )
}
