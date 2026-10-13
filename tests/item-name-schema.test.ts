import { describe, expect, it } from 'vitest'
import { ITEM_NAME_MAX_LENGTH, itemNameSchema } from '~/tinycld/drive/lib/item-name-schema'

describe('itemNameSchema', () => {
    it('accepts a name and trims surrounding whitespace', () => {
        expect(itemNameSchema.parse({ name: '  Reports  ' })).toEqual({ name: 'Reports' })
    })

    it('rejects an empty name', () => {
        expect(itemNameSchema.safeParse({ name: '' }).success).toBe(false)
    })

    it('rejects a whitespace-only name', () => {
        expect(itemNameSchema.safeParse({ name: '   ' }).success).toBe(false)
    })

    it('accepts a name at the server limit', () => {
        const name = 'a'.repeat(ITEM_NAME_MAX_LENGTH)
        expect(itemNameSchema.safeParse({ name }).success).toBe(true)
    })

    it('rejects a name over the server limit', () => {
        const name = 'a'.repeat(ITEM_NAME_MAX_LENGTH + 1)
        expect(itemNameSchema.safeParse({ name }).success).toBe(false)
    })
})
