import { getFileToken } from '@tinycld/core/file-viewer/use-authed-file-url'
import { pb } from '@tinycld/core/lib/pocketbase'

// URLs for the stable file endpoints (drive/server/endpoints_file.go).
//
// A `/api/files/drive_items/<id>/<file>` URL names one blob, and a document
// open in an editor is written under a new blob name every few seconds, so
// that URL is correct only until the next save. These endpoints take the
// record id alone, flush a live editor room first, and serve the current
// bytes with no caching. The file token is the credential for the paths
// that cannot carry a header (anchor download, window.open, native
// downloader); the SDK's own requests are authed either way.

export async function itemFileUrl(itemId: string): Promise<string> {
    return withFileToken(`${pb.baseURL}/api/drive/items/${encodeURIComponent(itemId)}/file`)
}

export async function versionFileUrl(versionId: string): Promise<string> {
    return withFileToken(`${pb.baseURL}/api/drive/versions/${encodeURIComponent(versionId)}/file`)
}

async function withFileToken(url: string): Promise<string> {
    const token = await getFileToken()
    return token ? `${url}?token=${encodeURIComponent(token)}` : url
}
