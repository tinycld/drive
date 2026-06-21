// Templates are ordinary drive files distinguished only by a naming
// convention: a document whose name ends in `.tmpl.docx` (text) or
// `.tmpl.xlsx` (calc) is a template. These helpers convert between a
// regular document name and its template form, so the File menus and the
// template picker don't hand-roll string surgery.

export const TEMPLATE_EXTENSIONS = {
    docx: '.tmpl.docx',
    xlsx: '.tmpl.xlsx',
} as const

export type TemplateExtension = (typeof TEMPLATE_EXTENSIONS)[keyof typeof TEMPLATE_EXTENSIONS]

// The base file extension implied by each template extension. Used when
// deriving a template name (strip the base ext before appending the
// template ext) and a document name (restore the base ext).
const BASE_EXTENSION: Record<TemplateExtension, string> = {
    '.tmpl.docx': '.docx',
    '.tmpl.xlsx': '.xlsx',
}

// endsWithCI reports whether `name` ends with `suffix`, case-insensitively
// on the suffix — drive names can carry a `.DOCX` from an upload, but the
// convention is otherwise lowercase.
function endsWithCI(name: string, suffix: string): boolean {
    return name.toLowerCase().endsWith(suffix.toLowerCase())
}

// isTemplateName reports whether a drive name already follows the
// template convention for the given template extension. The File menu
// uses it to hide "Export as template" on a document that's already a
// template (which would otherwise double-suffix).
export function isTemplateName(name: string, templateExt: TemplateExtension): boolean {
    return endsWithCI(name, templateExt)
}

// toTemplateName converts a document name into its template form:
// strip a trailing base extension (`.docx`/`.xlsx`) if present, then
// append the template extension. Idempotent — a name that's already a
// template is returned unchanged, so repeated exports never stack
// `.tmpl.tmpl`.
export function toTemplateName(name: string, templateExt: TemplateExtension): string {
    const trimmed = name.trim()
    if (isTemplateName(trimmed, templateExt)) {
        return trimmed
    }
    const baseExt = BASE_EXTENSION[templateExt]
    const stem = endsWithCI(trimmed, baseExt) ? trimmed.slice(0, -baseExt.length) : trimmed
    return `${stem}${templateExt}`
}

// fromTemplateName converts a template name back into a regular document
// name: replace the trailing template extension with its base extension.
// A name that isn't a template is returned unchanged.
export function fromTemplateName(name: string, templateExt: TemplateExtension): string {
    const trimmed = name.trim()
    if (!isTemplateName(trimmed, templateExt)) {
        return trimmed
    }
    const baseExt = BASE_EXTENSION[templateExt]
    return `${trimmed.slice(0, -templateExt.length)}${baseExt}`
}

// templateDisplayName strips the `.tmpl.<ext>` suffix entirely, yielding
// the bare stem the template picker shows as a friendly label (e.g.
// "Quarterly Report" for "Quarterly Report.tmpl.docx").
export function templateDisplayName(name: string, templateExt: TemplateExtension): string {
    if (!isTemplateName(name.trim(), templateExt)) {
        return name.trim()
    }
    return name.trim().slice(0, -templateExt.length)
}
