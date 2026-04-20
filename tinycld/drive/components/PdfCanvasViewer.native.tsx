// Native stub: pdfjs-dist relies on browser/Node-only APIs (`import.meta`,
// canvas) that don't work in Hermes. Native callers fall back to GenericPreview
// before reaching this component, but the stub keeps Metro from bundling
// pdfjs-dist into the iOS/Android bundles.
export function PdfCanvasViewer(_props: { url: string }) {
    return null
}
