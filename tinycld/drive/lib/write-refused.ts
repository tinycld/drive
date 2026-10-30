import { captureException, errorToString } from '@tinycld/core/lib/errors'
import { notify } from '@tinycld/core/lib/notify'
import { ClientResponseError } from 'pocketbase'

// A 409 is drive refusing a write because the file is open in an editor
// (drive/server/endpoints_file.go writeItemFile): expected, not a bug.
export function isWriteRefused(err: unknown): boolean {
    return err instanceof ClientResponseError && err.status === 409
}

// Tells the user why a file write did not happen, and reports every failure
// except a refusal to Sentry.
export function notifyWriteFailed(operation: string, title: string, err: unknown): void {
    if (!isWriteRefused(err)) captureException(operation, err)
    notify.emit({
        event: 'mutation.error',
        title,
        body: errorToString(err),
        data: { operation, error: errorToString(err) },
    })
}
