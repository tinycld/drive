#!/usr/bin/env npx tsx
/**
 * Database Seed Script
 *
 * Populates the PocketBase database with a test user and org.
 *
 * Usage:
 *   npx tsx scripts/seed-db.ts [options]
 *
 * Options:
 *   --url <url>           PocketBase URL (default: http://127.0.0.1:7090)
 *   --admin-email <email> Admin email
 *   --admin-pw <pw>       Admin password
 *   --help                Show this help message
 */

import PocketBase from 'pocketbase'
import { addonSeeds } from '../lib/generated/addon-seeds'

try {
    process.loadEnvFile()
} catch {
    // .env may not exist in CI
}

interface SeedConfig {
    url: string
    adminEmail: string
    adminPassword: string
}

function parseArgs(): SeedConfig {
    const args = process.argv.slice(2)
    const config: SeedConfig = {
        url: 'http://127.0.0.1:7090',
        adminEmail: process.env.ADMIN_USER_LOGIN || 'admin@tinycld.org',
        adminPassword: process.env.ADMIN_USER_PW || 'AdminPass1234!',
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        switch (arg) {
            case '--url':
                config.url = args[++i]
                break
            case '--admin-email':
                config.adminEmail = args[++i]
                break
            case '--admin-pw':
                config.adminPassword = args[++i]
                break
            case '--help':
                process.exit(0)
                break
            default:
                if (arg.startsWith('-')) {
                    process.exit(1)
                }
        }
    }

    return config
}

const TEST_ORG_NAME = 'Test Organization'
const TEST_ORG_SLUG = 'test-org'
const TEST_USER_EMAIL = process.env.TEST_USER_LOGIN || 'user@tinycld.org'
const TEST_USER_PASSWORD = process.env.TEST_USER_PW || 'TestUser1234!'
const TEST_USER_NAME = 'Test User'

async function main() {
    const config = parseArgs()
    const pb = new PocketBase(config.url)

    // Authenticate as superuser
    await pb.collection('_superusers').authWithPassword(config.adminEmail, config.adminPassword)

    const user = await pb.collection('users').create({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        passwordConfirm: TEST_USER_PASSWORD,
        name: TEST_USER_NAME,
        verified: true,
    })

    const org = await pb.collection('orgs').create({
        name: TEST_ORG_NAME,
        slug: TEST_ORG_SLUG,
        users: [user.id],
    })

    const userOrg = await pb.collection('user_org').create({
        org: org.id,
        user: user.id,
        role: 'admin',
    })

    // Run addon seeds
    const seedContext = {
        user: { id: user.id, email: TEST_USER_EMAIL, name: TEST_USER_NAME },
        org,
        userOrg,
    }
    for (const [_slug, seedFn] of Object.entries(addonSeeds)) {
        await seedFn(pb, seedContext)
    }
}

main().catch(_err => {
    process.exit(1)
})
