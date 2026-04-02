#!/usr/bin/env npx tsx
/**
 * Reset Database Script
 *
 * Deletes server/pb_data, starts PocketBase to run migrations,
 * then seeds the database with a test user and org.
 *
 * Usage:
 *   npx tsx scripts/reset-dev-db.ts [options]
 *
 * Options:
 *   --url <url>        PocketBase URL (default: http://127.0.0.1:7090)
 *   --data-dir <dir>   Data directory (default: server/pb_data)
 *   --skip-build       Skip building PocketBase
 *   --keep-running     Keep server running after seeding (default: false)
 *   --help             Show this help message
 *
 * Environment variables (from .env):
 *   POCKETBASE_EMAIL     - Superuser email (or SEED_ADMIN_EMAIL)
 *   POCKETBASE_PASSWORD  - Superuser password (or SEED_ADMIN_PW)
 */

import { spawn, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface Config {
    url: string
    dataDir: string
    skipBuild: boolean
    keepRunning: boolean
}

function parseArgs(): Config {
    const args = process.argv.slice(2)
    const config: Config = {
        url: 'http://127.0.0.1:7090',
        dataDir: 'server/pb_data',
        skipBuild: false,
        keepRunning: false,
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        switch (arg) {
            case '--url':
                config.url = args[++i]
                break
            case '--data-dir':
                config.dataDir = args[++i]
                break
            case '--skip-build':
                config.skipBuild = true
                break
            case '--keep-running':
                config.keepRunning = args[++i] !== 'false'
                break
            case '--help':
                console.log(`
Reset Database Script

Deletes server/pb_data, starts PocketBase to run migrations,
then seeds the database with a test user and org.

Usage:
  npx tsx scripts/reset-dev-db.ts [options]

Options:
  --url <url>        PocketBase URL (default: http://127.0.0.1:7090)
  --data-dir <dir>   Data directory (default: server/pb_data)
  --skip-build       Skip building PocketBase
  --keep-running     Keep server running after seeding (default: false)
  --help             Show this help message

Environment variables (from .env):
  POCKETBASE_EMAIL     - Superuser email (or SEED_ADMIN_EMAIL)
  POCKETBASE_PASSWORD  - Superuser password (or SEED_ADMIN_PW)
`)
                process.exit(0)
                break
            default:
                if (arg.startsWith('-')) {
                    console.error(`Unknown option: ${arg}`)
                    process.exit(1)
                }
        }
    }

    return config
}

const CONFIG = parseArgs()
const PB_URL = CONFIG.url
const parsedUrl = new URL(PB_URL)
const PB_HOST = parsedUrl.hostname
const PB_PORT = parseInt(parsedUrl.port || '8090', 10)
const PB_DATA_DIR = path.join(process.cwd(), CONFIG.dataDir)
const PB_BINARY = path.join(process.cwd(), 'server/tinycld')

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForPocketBase(maxAttempts = 30): Promise<boolean> {
    console.log('Waiting for PocketBase to be ready...')
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(`${PB_URL}/api/health`)
            if (response.ok) {
                console.log('PocketBase is ready')
                return true
            }
        } catch {
            // Server not ready yet
        }
        await sleep(1000)
    }
    return false
}

function killExistingPocketBase(): void {
    console.log('Checking for existing PocketBase processes...')
    try {
        const result = spawnSync('lsof', ['-ti', `:${PB_PORT}`], {
            encoding: 'utf-8',
        })
        if (result.stdout.trim()) {
            const pids = result.stdout.trim().split('\n')
            for (const pid of pids) {
                console.log(`  Killing process ${pid}...`)
                spawnSync('kill', ['-9', pid])
            }
            console.log('Killed existing processes')
        } else {
            console.log('No existing processes found')
        }
    } catch {
        // No processes to kill
    }
}

function deletePbData(): void {
    console.log(`Deleting ${PB_DATA_DIR}...`)
    if (fs.existsSync(PB_DATA_DIR)) {
        fs.rmSync(PB_DATA_DIR, { recursive: true, force: true })
        console.log('Deleted server/pb_data directory')
    } else {
        console.log('server/pb_data directory does not exist')
    }
}

function buildPocketBase(): void {
    if (CONFIG.skipBuild) {
        console.log('Skipping PocketBase build')
        return
    }
    console.log('Building PocketBase...')
    const result = spawnSync('go', ['build', '-o', 'tinycld', '.'], {
        cwd: path.join(process.cwd(), 'server'),
        stdio: 'inherit',
    })
    if (result.status !== 0) {
        throw new Error('Failed to build PocketBase')
    }
    console.log('PocketBase built successfully')
}

function getCredentials(): { email: string; password: string } {
    const email =
        process.env.POCKETBASE_EMAIL ||
        process.env.SEED_ADMIN_EMAIL ||
        'admin@tinycld.org'
    const password =
        process.env.POCKETBASE_PASSWORD ||
        process.env.SEED_ADMIN_PW ||
        'AdminPass1234!'
    return { email, password }
}

function createSuperuser(): void {
    const { email, password } = getCredentials()

    console.log(`Creating superuser ${email}...`)
    const result = spawnSync(
        PB_BINARY,
        ['superuser', 'upsert', email, password, '--dir', PB_DATA_DIR],
        {
            stdio: 'inherit',
        },
    )
    if (result.status !== 0) {
        throw new Error('Failed to create superuser')
    }
    console.log('Superuser created successfully')
}

async function startPocketBase(): Promise<ReturnType<typeof spawn>> {
    console.log('Starting PocketBase...')

    const migrationsDir = path.join(process.cwd(), 'server/pb_migrations')
    const pb = spawn(
        PB_BINARY,
        [
            '--dev',
            '--dir',
            PB_DATA_DIR,
            '--migrationsDir',
            migrationsDir,
            '--http',
            `${PB_HOST}:${PB_PORT}`,
            'serve',
        ],
        {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
        },
    )

    pb.stdout?.on('data', (data) => {
        const output = data.toString()
        if (output.includes('Server started')) {
            console.log('  PocketBase server started')
        }
    })

    pb.stderr?.on('data', (data) => {
        const output = data.toString()
        if (output.includes('error') || output.includes('Error')) {
            console.error('  PocketBase error:', output)
        }
    })

    pb.on('error', (err) => {
        console.error('Failed to start PocketBase:', err)
    })

    return pb
}

async function runSeedScript(): Promise<void> {
    console.log('Running seed script...')

    const { email, password } = getCredentials()

    return new Promise((resolve, reject) => {
        const seed = spawn(
            'npx',
            [
                'tsx',
                'scripts/seed-db.ts',
                '--url',
                PB_URL,
                '--admin-email',
                email,
                '--admin-pw',
                password,
            ],
            {
                stdio: 'inherit',
                env: process.env,
            },
        )

        seed.on('close', (code) => {
            if (code === 0) {
                resolve()
            } else {
                reject(new Error(`Seed script exited with code ${code}`))
            }
        })

        seed.on('error', reject)
    })
}

async function main() {
    console.log('')
    console.log('=== Reset Database ===')
    console.log('')
    console.log(`  URL: ${PB_URL}`)
    console.log(`  Data dir: ${PB_DATA_DIR}`)
    console.log('')

    let pb: ReturnType<typeof spawn> | null = null

    try {
        killExistingPocketBase()
        deletePbData()
        buildPocketBase()
        createSuperuser()
        pb = await startPocketBase()

        const ready = await waitForPocketBase()
        if (!ready) {
            throw new Error('PocketBase failed to start within timeout')
        }

        await runSeedScript()

        console.log('')
        console.log('=== Database reset complete! ===')
        console.log('')

        if (CONFIG.keepRunning) {
            console.log(
                'PocketBase is still running. Press Ctrl+C to stop.',
            )
            console.log('')

            await new Promise<void>((resolve) => {
                process.on('SIGINT', () => {
                    console.log('\nShutting down...')
                    resolve()
                })
                process.on('SIGTERM', () => {
                    console.log('\nShutting down...')
                    resolve()
                })
            })
        }
    } catch (err) {
        console.error('')
        console.error('Reset failed:', err)
        process.exit(1)
    } finally {
        if (pb) {
            console.log('Stopping PocketBase...')
            pb.kill('SIGTERM')
        }
    }
}

main()
