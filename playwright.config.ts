import path from 'node:path'
import { defineConfig } from '@playwright/test'
import appConfig from '@tinycld/core/playwright-config'

const WS_ROOT = path.resolve(import.meta.dirname, '..')
const TEST_DIR = path.join(WS_ROOT, 'node_modules', '@tinycld', 'drive', 'tests')

export default defineConfig({
    ...appConfig,
    testDir: TEST_DIR,
    // Per-test timeout. Default is 30s; drive tests open folders + load
    // file rows which include nested package-screen lazy chunks; on CI
    // under parallel load the first navigation per worker can blow
    // through 60s before the sidebar or first row mounts. 90s matches
    // mail's bump for the same root cause (cold-cache lazy compile on
    // the 2-core ubuntu runner).
    timeout: 90_000,
})
