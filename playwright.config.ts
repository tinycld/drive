import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: '.',
    testMatch: ['tests/e2e/**/*.spec.ts', 'packages/*/tests/**/*.spec.ts'],
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:8100',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:8100',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
})
