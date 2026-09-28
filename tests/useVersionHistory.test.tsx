// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tinycld/core/lib/pocketbase', async () => {
    const { createCollection, localOnlyCollectionOptions } = await import('@tanstack/db')
    const mk = <T extends { id: string }>(id: string, initialData: T[]) =>
        createCollection(localOnlyCollectionOptions({ id, getKey: (r: T) => r.id, initialData }))
    const registry: Record<string, unknown> = {
        drive_item_versions: mk('drive_item_versions', [
            {
                id: 'v-upload-1',
                item: 'it1',
                version_number: 1,
                source: 'upload',
                created_by: 'me',
            },
            {
                id: 'v-system-restore',
                item: 'it1',
                version_number: 2,
                source: 'system',
                created_by: 'me',
            },
            {
                id: 'v-user-snapshot',
                item: 'it1',
                version_number: 3,
                source: 'user',
                created_by: 'me',
            },
            // Belongs to a different item — proves the where clause still
            // scopes by item alongside the source filter.
            {
                id: 'v-other-item',
                item: 'it2',
                version_number: 1,
                source: 'upload',
                created_by: 'me',
            },
        ]),
    }
    return {
        useStore: (...names: string[]) => names.map(n => registry[n]),
        pb: { send: vi.fn() },
    }
})

import { useVersionHistory } from '../tinycld/drive/hooks/useVersionHistory'

function wrapper() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

afterEach(cleanup)

describe('useVersionHistory', () => {
    // Regression test for the `not(eq(v.source, 'system'))` form: pbtsdb
    // compiles not() to `!(...)`, which PocketBase's filter parser rejects.
    // The hook must use the positive inArray(v.source, ['upload', 'user'])
    // form instead, and still hide 'system' (hidden restore snapshots) and
    // rows from other items.
    it('excludes system versions and other items, newest first', async () => {
        const { result } = renderHook(() => useVersionHistory('it1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.versions.length).toBe(2))
        expect(result.current.versions.map(v => v.id)).toEqual(['v-user-snapshot', 'v-upload-1'])
    })
})
