import {
    BlockquoteBridge,
    BoldBridge,
    BulletListBridge,
    CoreBridge,
    DropCursorBridge,
    HardBreakBridge,
    HeadingBridge,
    HistoryBridge,
    ItalicBridge,
    LinkBridge,
    OrderedListBridge,
    PlaceholderBridge,
    UnderlineBridge,
    useEditorBridge,
} from '@10play/tentap-editor'
import { useMemo } from 'react'
import { useTheme } from 'tamagui'

function buildEditorCSS(colors: { bg: string; fg: string; placeholder: string; accent: string }) {
    return `
        * {
            background-color: ${colors.bg};
            color: ${colors.fg};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .ProseMirror {
            padding: 24px 32px;
            min-height: 100%;
            font-size: 15px;
            line-height: 1.7;
            max-width: 800px;
            margin: 0 auto;
        }
        .ProseMirror:focus {
            outline: none;
        }
        .is-editor-empty:first-child::before {
            color: ${colors.placeholder};
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
        }
        h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; }
        h2 { font-size: 1.5em; font-weight: 600; margin: 0.8em 0 0.4em; }
        h3 { font-size: 1.25em; font-weight: 600; margin: 0.6em 0 0.3em; }
        blockquote {
            border-left: 3px solid ${colors.placeholder};
            padding-left: 1rem;
            margin-left: 0;
            color: ${colors.placeholder};
        }
        a {
            color: ${colors.accent};
            text-decoration: underline;
        }
        ul, ol {
            padding-left: 1.5rem;
        }
    `
}

const baseBridgeExtensions = [
    BoldBridge,
    ItalicBridge,
    UnderlineBridge,
    HeadingBridge,
    BulletListBridge,
    OrderedListBridge,
    BlockquoteBridge,
    LinkBridge,
    HistoryBridge,
    HardBreakBridge,
    DropCursorBridge,
]

interface UseDocumentEditorOptions {
    initialContent?: string
    editable?: boolean
}

export function useDocumentEditor(options: UseDocumentEditorOptions = {}) {
    const theme = useTheme()

    const bgColor = theme.background.val
    const fgColor = theme.color.val
    const placeholderColor = theme.placeholderColor.val
    const accentColor = theme.accentBackground.val
    const editable = options.editable ?? true

    const bridgeExtensions = useMemo(() => {
        const css = buildEditorCSS({
            bg: bgColor,
            fg: fgColor,
            placeholder: placeholderColor,
            accent: accentColor,
        })
        return [
            CoreBridge.configureCSS(css),
            ...baseBridgeExtensions,
            PlaceholderBridge.configureExtension({
                placeholder: 'Start writing...',
            }),
        ]
    }, [bgColor, fgColor, placeholderColor, accentColor])

    const editorTheme = useMemo(() => ({ webview: { backgroundColor: bgColor } }), [bgColor])

    return useEditorBridge({
        initialContent: options.initialContent,
        bridgeExtensions,
        theme: editorTheme,
        editable,
    })
}
