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

process.loadEnvFile()

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
                console.log(`
Database Seed Script

Populates the PocketBase database with a test user and org.

Usage:
  npx tsx scripts/seed-db.ts [options]

Options:
  --url <url>           PocketBase URL (default: http://127.0.0.1:7090)
  --admin-email <email> Admin email
  --admin-pw <pw>       Admin password
  --help                Show this help message
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

const TEST_ORG_NAME = 'Test Organization'
const TEST_ORG_SLUG = 'test-org'
const TEST_USER_EMAIL = process.env.TEST_USER_LOGIN || 'user@tinycld.org'
const TEST_USER_PASSWORD = process.env.TEST_USER_PW || 'TestUser1234!'
const TEST_USER_NAME = 'Test User'

async function main() {
    const config = parseArgs()
    const pb = new PocketBase(config.url)

    console.log(`Connecting to PocketBase at ${config.url}...`)

    // Authenticate as superuser
    await pb
        .collection('_superusers')
        .authWithPassword(config.adminEmail, config.adminPassword)
    console.log('Authenticated as superuser')

    // Create test user
    console.log(`Creating test user: ${TEST_USER_EMAIL}`)
    const user = await pb.collection('users').create({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        passwordConfirm: TEST_USER_PASSWORD,
        name: TEST_USER_NAME,
        verified: true,
    })
    console.log(`  Created user: ${user.id}`)

    // Create test org
    console.log(`Creating test org: ${TEST_ORG_NAME}`)
    const org = await pb.collection('orgs').create({
        name: TEST_ORG_NAME,
        slug: TEST_ORG_SLUG,
        users: [user.id],
    })
    console.log(`  Created org: ${org.id}`)

    // Create user_org junction
    console.log('Linking user to org as admin...')
    const userOrg = await pb.collection('user_org').create({
        org: org.id,
        user: user.id,
        role: 'admin',
    })
    console.log(`  Created user_org: ${userOrg.id}`)

    // Run addon seeds
    const seedContext = { user, org, userOrg }
    for (const [slug, seedFn] of Object.entries(addonSeeds)) {
        console.log(`Running seed for addon: ${slug}`)
        await seedFn(pb, seedContext)
    }

    console.log('')
    console.log('Seed complete!')
    console.log(`  User: ${TEST_USER_EMAIL} / ${TEST_USER_PASSWORD}`)
    console.log(`  Org: ${TEST_ORG_NAME} (${TEST_ORG_SLUG})`)
}

main().catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
})
