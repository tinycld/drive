import { addonRegistry } from '~/lib/generated/addon-registry'

export function useAddons() {
    return addonRegistry
}

export function useAddon(slug: string) {
    return addonRegistry.find((a) => a.slug === slug) ?? null
}
