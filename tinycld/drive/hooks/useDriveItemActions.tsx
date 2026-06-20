import { useEffect, useSyncExternalStore } from 'react'
import type { DriveItemAction } from '../lib/item-actions-registry'
import {
    getDriveItemActionFactories,
    subscribeDriveItemActions,
} from '../lib/item-actions-registry'

/**
 * Why this file exists — the "Cannot read properties of undefined
 * (reading 'length')" crash:
 *
 * A drive item-action factory is itself a hook (it calls useOrgHref,
 * mutations, …). The set of registered factories grows at RUNTIME:
 * providers are lazy-loaded (tinycld.config.ts), so on the drive landing
 * screen the registry goes empty → 1 → 2 across the first few renders.
 * Calling `factories.map(f => f())` at a component's top level therefore
 * makes that component's hook COUNT change between renders, which corrupts
 * React's hook dispatcher and crashes in areHookInputsEqual.
 *
 * Fix: invoke each factory inside its OWN component instance (one factory
 * per `DriveItemActionRunner` => a fixed hook count per instance). Each
 * runner publishes its resolved action into a module-level store; consumers
 * read the resolved actions via `useResolvedDriveItemActions`, never calling
 * the factories themselves. `DriveItemActionsHost` (mounted once in the
 * drive layout) renders the runners.
 */

const resolved = new Map<string, DriveItemAction>()
const subscribers = new Set<() => void>()
let snapshot: DriveItemAction[] = []

function publish(id: string, action: DriveItemAction | null) {
    if (action) {
        resolved.set(id, action)
    } else {
        resolved.delete(id)
    }
    snapshot = Array.from(resolved.values())
    for (const notify of subscribers) notify()
}

function subscribe(notify: () => void) {
    subscribers.add(notify)
    return () => subscribers.delete(notify)
}

function getSnapshot() {
    return snapshot
}

/**
 * Resolved (invoked) item actions, in registration order. Re-renders the
 * caller when a factory registers, unregisters, or re-resolves. Safe to
 * call at the top level: its hook count never varies.
 */
export function useResolvedDriveItemActions(): DriveItemAction[] {
    return useSyncExternalStore(subscribe, getSnapshot)
}

// Runs a single factory and publishes its result. One factory => one
// component instance => a stable hook count, so it's safe to call the
// factory (a hook) here. Publishing happens in an effect (not during
// render) to avoid updating subscriber components mid-render, and the
// effect clears the entry on unmount so a removed factory drops out.
// Renders nothing.
function DriveItemActionRunner({ id, factory }: { id: string; factory: () => DriveItemAction }) {
    const action = factory()
    useEffect(() => {
        publish(id, action)
        return () => publish(id, null)
    }, [id, action])
    return null
}

// Subscribes to the registry and mounts one runner per registered factory.
// Keyed by the factory id so adding/removing a factory mounts/unmounts a
// whole runner (its own hooks) rather than shifting another component's
// hook order. Mount once, high in the drive tree (DriveLayoutInner).
export function DriveItemActionsHost() {
    const factories = useSyncExternalStore(subscribeDriveItemActions, getDriveItemActionFactories)
    return (
        <>
            {factories.map(({ id, factory }) => (
                <DriveItemActionRunner key={id} id={id} factory={factory} />
            ))}
        </>
    )
}
