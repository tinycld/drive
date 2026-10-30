import { ClientResponseError } from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { isWriteRefused } from '../tinycld/drive/lib/write-refused'

// A 409 is drive refusing a write because the file is open in an editor: an
// expected outcome the user is told about, not a bug to report.
describe('isWriteRefused', () => {
    it('is true for a 409 from the server', () => {
        expect(isWriteRefused(new ClientResponseError({ status: 409 }))).toBe(true)
    })

    it('is false for any other failure', () => {
        expect(isWriteRefused(new ClientResponseError({ status: 500 }))).toBe(false)
        expect(isWriteRefused(new Error('network'))).toBe(false)
    })
})
