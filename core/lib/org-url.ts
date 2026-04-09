export function navigateToOrg(orgSlug: string): void {
    if (typeof window !== 'undefined') {
        window.location.href = `/a/${orgSlug}`
    }
}
