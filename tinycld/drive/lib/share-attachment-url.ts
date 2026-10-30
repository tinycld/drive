// URL for an image attached to a shared document, as an anonymous share
// visitor fetches it (drive/server/endpoints_share_attachment.go). The
// visitor has no file token; the share session is the credential.
//
// Pure (no `pb` import) so the text editor's WebView bundle can use it.
export function shareAttachmentUrl(baseURL: string, itemId: string, sessionToken: string): string {
    const base = baseURL.replace(/\/+$/, '')
    return `${base}/api/drive/share-session/attachments/${encodeURIComponent(itemId)}?inline=1&session=${encodeURIComponent(sessionToken)}`
}
