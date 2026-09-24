// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tinycld/core/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { createCollection, localOnlyCollectionOptions } = await import('@tanstack/db')
    const mk = <T extends { id: string }>(id: string, initialData: T[]) =>
        createCollection(localOnlyCollectionOptions({ id, getKey: (r: T) => r.id, initialData }))
    const registry: Record<string, unknown> = {
        users: mk('users', [
            { id: 'me', name: 'Me', email: 'me@x.test', role: 'member' },
            { id: 'u2', name: 'Bo', email: 'bo@x.test', role: 'member' },
        ]),
        drive_items: mk('drive_items', [
            { id: 'it1', name: 'plans', created_by: 'me' },
            { id: 'it2', name: 'other', created_by: 'u2' },
        ]),
        drive_shares: mk('drive_shares', [
            { id: 's-owner', item: 'it1', user: 'me', group: '', role: 'owner', created_by: 'me' },
            {
                id: 's-direct',
                item: 'it1',
                user: 'u2',
                group: '',
                role: 'viewer',
                created_by: 'me',
            },
            { id: 's-grant', item: 'it1', user: '', group: 'g1', role: 'viewer', created_by: 'me' },
            {
                id: 's-derived',
                item: 'it1',
                user: 'u2',
                group: 'g1',
                role: 'viewer',
                created_by: 'me',
            },
        ]),
    }
    return { useStore: (...names: string[]) => names.map(n => registry[n]) }
})

import { useShareData } from '../tinycld/drive/hooks/use-share-data'

function wrapper() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

afterEach(cleanup)

describe('useShareData', () => {
    it('lists direct shares only and marks the creator as manager', async () => {
        const { result } = renderHook(() => useShareData('it1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.shares.length).toBeGreaterThan(0))
        expect(result.current.shares.map(s => s.id).sort()).toEqual(['s-direct', 's-owner'])
        expect(result.current.canManage).toBe(true)
    })

    it('is not manageable by a non-creator', async () => {
        const { result } = renderHook(() => useShareData('it2'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.canManage).toBe(false))
    })
})
