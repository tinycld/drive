// A theme color with transparency, for highlights drawn over text. Theme
// colors arrive as `rgb(r g b)` on web and as hex on native.
export function withAlpha(color: string, alpha: number): string {
    const rgb = color.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
    if (rgb) return `rgb(${rgb[1]} ${rgb[2]} ${rgb[3]} / ${alpha})`
    const hex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
    if (hex) {
        const [r, g, b] = hex.slice(1, 4).map(h => Number.parseInt(h, 16))
        return `rgb(${r} ${g} ${b} / ${alpha})`
    }
    return 'transparent'
}
