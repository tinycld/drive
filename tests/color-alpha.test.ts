import { describe, expect, it } from 'vitest'
import { withAlpha } from '~/tinycld/drive/lib/color-alpha'

describe('withAlpha', () => {
    it('adds alpha to space-separated rgb (web theme variables)', () => {
        expect(withAlpha('rgb(16 185 129)', 0.2)).toBe('rgb(16 185 129 / 0.2)')
    })
    it('adds alpha to comma-separated rgb', () => {
        expect(withAlpha('rgb(16, 185, 129)', 0.2)).toBe('rgb(16 185 129 / 0.2)')
    })
    it('adds alpha to a hex color (native)', () => {
        expect(withAlpha('#10b981', 0.2)).toBe('rgb(16 185 129 / 0.2)')
    })
    it('returns transparent for a color it cannot read', () => {
        expect(withAlpha('', 0.2)).toBe('transparent')
    })
})
