const DEV_PB_ADDR = 'http://127.0.0.1:7090'

function resolveServerAddr(): string {
    if (process.env.NODE_ENV !== 'production') return DEV_PB_ADDR
    if (typeof window === 'undefined') return DEV_PB_ADDR

    const { protocol, hostname, port } = window.location
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`
}

export const PB_SERVER_ADDR =
    process.env.VITE_PB_SERVER_ADDR || process.env.PB_SERVER_ADDR || resolveServerAddr()
