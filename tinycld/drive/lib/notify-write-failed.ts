import { captureException, errorToString } from '@tinycld/core/lib/errors'
import { notify } from '@tinycld/core/lib/notify'

// Tells the user why a file write did not happen, and reports the failure.
export function notifyWriteFailed(operation: string, title: string, err: unknown): void {
    captureException(operation, err)
    notify.emit({
        event: 'mutation.error',
        title,
        body: errorToString(err),
        data: { operation, error: errorToString(err) },
    })
}
