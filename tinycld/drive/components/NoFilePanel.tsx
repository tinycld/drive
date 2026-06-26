import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { type Href, Link } from 'expo-router'
import {
    ChevronRight,
    Clock,
    FolderOpen,
    LayoutTemplate,
    type LucideIcon,
    Plus,
    Upload,
} from 'lucide-react-native'
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
    /**
     * Optional fourth card opening a package-supplied template picker.
     * `label` is the accessible name (also the visible card label) — text
     * uses 'From template…' so its e2e selectors keep working.
     */
    template?: { label: string; onPress: () => void }
    /** Disables Create + Upload while a mutation is in flight. */
    isPending?: boolean
}

/**
 * Drive-owned landing panel for "file editor" packages (calc, text) when
 * no file is open.
 *
 * Two presentations from one set of CTAs:
 *  - tablet/desktop → a centered grid of equal-size cards (create, upload,
 *    optional template, and a Browse card that splits into Recent / All).
 *  - mobile → a full-width vertical list of rows (leading icon chip, title
 *    + hint, trailing chevron), matching the app's list rhythm elsewhere.
 *    The fixed-width cards wrapped into a lopsided grid on a phone; rows
 *    give bigger tap targets and a calmer, more intentional layout.
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
    template,
    isPending = false,
}: NoFilePanelProps) {
    const orgHref = useOrgHref()
    const dividerColor = useThemeColor('muted-foreground')
    const isMobile = useBreakpoint() === 'mobile'

    // Drive's _layout wraps its routes in a <Stack> with both an index.tsx
    // and a [...path].tsx as sibling stack entries. When <Link> navigates
    // from outside drive into this stack with the catch-all object Href
    // form, Expo Router's state resolution dispatches to the index screen
    // instead of the catch-all, silently dropping the rest of the path.
    // Drive therefore ships a literal /drive/recent route file
    // (drive/tinycld/drive/screens/recent.tsx) so the <Link> below resolves
    // to a non-ambiguous named screen and navigation works as expected.
    const recentHref = orgHref('drive/recent')
    const allHref = orgHref('drive')

    return (
        <View
            className={
                isMobile
                    ? 'flex-1 justify-center bg-background px-5 py-12'
                    : 'flex-1 items-center justify-center bg-background px-8 py-16'
            }
        >
            <View className={isMobile ? 'w-full gap-9' : 'w-full max-w-3xl items-center gap-10'}>
                <View className={isMobile ? 'gap-4' : 'items-center gap-5'}>
                    <Text
                        accessibilityRole="header"
                        aria-level={1}
                        className={
                            isMobile
                                ? 'text-4xl font-light tracking-tight text-foreground'
                                : 'text-5xl font-light tracking-tight text-foreground'
                        }
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

                {isMobile ? (
                    <View className="w-full overflow-hidden rounded-2xl border border-border bg-background">
                        <CtaRow
                            Icon={Plus}
                            label={newLabel}
                            hint={isPending ? 'Creating…' : 'Start blank'}
                            onPress={onCreateNew}
                            disabled={isPending}
                        />
                        {template ? (
                            <CtaRow
                                Icon={LayoutTemplate}
                                label={template.label}
                                hint="Pick a starter"
                                onPress={template.onPress}
                                disabled={isPending}
                            />
                        ) : null}
                        <UploadRow
                            hint={uploadHint}
                            accept={accept}
                            onPick={onUpload}
                            disabled={isPending}
                        />
                        <LinkRow
                            Icon={Clock}
                            label="Recent files"
                            hint="Pick up where you left off"
                            href={recentHref}
                        />
                        <LinkRow
                            Icon={FolderOpen}
                            label="All files"
                            hint="Browse everything"
                            href={allHref}
                            isLast
                        />
                    </View>
                ) : (
                    <View className="w-full flex-row flex-wrap justify-center gap-4">
                        <CtaCard
                            Icon={Plus}
                            label={newLabel}
                            hint={isPending ? 'Creating…' : 'Start blank'}
                            onPress={onCreateNew}
                            disabled={isPending}
                        />
                        {template ? (
                            <CtaCard
                                Icon={LayoutTemplate}
                                label={template.label}
                                hint="Pick a starter"
                                onPress={template.onPress}
                                disabled={isPending}
                            />
                        ) : null}
                        <UploadCard
                            hint={uploadHint}
                            accept={accept}
                            onPick={onUpload}
                            disabled={isPending}
                        />
                        <BrowseCard recentHref={recentHref} allHref={allHref} />
                    </View>
                )}
            </View>
        </View>
    )
}

// ── Mobile rows ──────────────────────────────────────────────────────────
// A full-width row: leading icon chip, stacked title + hint, trailing
// chevron. A hairline border separates rows inside the rounded container;
// the last row drops its border so it doesn't double up with the wrapper.

interface RowShellProps {
    Icon: LucideIcon
    label: string
    hint: string
    isLast?: boolean
}

function RowIconChip({ Icon }: { Icon: LucideIcon }) {
    const iconColor = useThemeColor('foreground')
    return (
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-foreground/5">
            <Icon size={20} color={iconColor} />
        </View>
    )
}

function RowBody({ Icon, label, hint }: Omit<RowShellProps, 'isLast'>) {
    const chevronColor = useThemeColor('muted-foreground')
    return (
        <>
            <RowIconChip Icon={Icon} />
            <View className="flex-1 gap-0.5">
                <Text className="text-base font-medium text-foreground">{label}</Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {hint}
                </Text>
            </View>
            <ChevronRight size={18} color={chevronColor} />
        </>
    )
}

function rowClassName(isLast?: boolean): string {
    return [
        'flex-row items-center gap-3.5 px-4 py-3.5',
        isLast ? '' : 'border-b border-border',
        'active:bg-foreground/5 hover:bg-foreground/5 disabled:opacity-50',
    ].join(' ')
}

interface CtaRowProps extends Omit<RowShellProps, 'isLast'> {
    onPress: () => void
    disabled?: boolean
    isLast?: boolean
}

function CtaRow({ Icon, label, hint, onPress, disabled, isLast }: CtaRowProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            disabled={disabled}
            className={rowClassName(isLast)}
        >
            <RowBody Icon={Icon} label={label} hint={hint} />
        </Pressable>
    )
}

interface LinkRowProps extends RowShellProps {
    href: Href
}

function LinkRow({ Icon, label, hint, href, isLast }: LinkRowProps) {
    return (
        <Link href={href} asChild>
            <Pressable
                accessibilityRole="link"
                accessibilityLabel={label}
                className={rowClassName(isLast)}
            >
                <RowBody Icon={Icon} label={label} hint={hint} />
            </Pressable>
        </Link>
    )
}

interface UploadRowProps {
    hint: string
    accept: string
    onPick: (files: File[]) => void
    disabled?: boolean
    isLast?: boolean
}

function UploadRow({ hint, accept, onPick, disabled, isLast }: UploadRowProps) {
    const handleWebChange = useWebUploadChange(onPick)
    const handleNativePress = useNativeUploadPress(accept, onPick)

    if (Platform.OS === 'web') {
        return (
            <label
                style={{
                    display: 'flex',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                }}
            >
                <View className={`w-full ${rowClassName(isLast)}`}>
                    <RowBody Icon={Upload} label="Upload files" hint={hint} />
                </View>
                <input
                    data-testid="nofile-upload-input"
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
        )
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload files"
            onPress={handleNativePress}
            disabled={disabled}
            className={rowClassName(isLast)}
        >
            <RowBody Icon={Upload} label="Upload files" hint={hint} />
        </Pressable>
    )
}

// ── Desktop cards ────────────────────────────────────────────────────────

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
    const handleWebChange = useWebUploadChange(onPick)
    const handleNativePress = useNativeUploadPress(accept, onPick)

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
                        // Stable hook for e2e: the app shell keeps other package
                        // screens mounted-but-frozen (freezeOnBlur), so a bare
                        // `input[type="file"]` selector can match a frozen
                        // sibling's upload input too. Tests target this id.
                        data-testid="nofile-upload-input"
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

// ── Shared upload handlers (card + row presentations call the same code) ──

function useWebUploadChange(onPick: (files: File[]) => void) {
    return useCallback(
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
}

function useNativeUploadPress(accept: string, onPick: (files: File[]) => void) {
    return useCallback(async () => {
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
}
