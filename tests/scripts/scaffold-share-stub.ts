#!/usr/bin/env tsx
/**
 * scaffold-share-stub.ts — provisions the @tinycld/share-stub package into
 * the workspace that's hosting drive.
 *
 * Why a stub: drive's share-link E2E specs assert on what a share-editor
 * actually renders. Pointing them at real text/calc surfaces (ProseMirror
 * root, "Comments" button, "viewing as Anon" subtitle) couples drive's
 * CI to those packages' internals — when text changes its toolbar gating,
 * drive's CI goes red over a bug that doesn't live in drive. The stub
 * registers a minimal share-editor for `application/x-tinycld-stub` that
 * renders just enough mount fields (role, identity displayName, item
 * name) for drive to verify its OWN contract: "share route mounts the
 * correct editor for this mime type with the correct mount object."
 *
 * The script is idempotent. If share-stub already lives in the workspace
 * (e.g. a developer ran tests once locally), we skip the bootstrap call
 * and just re-emit the share-editor source files so iterating on them
 * doesn't require a clean checkout.
 *
 * Invocation:
 *   - CI: workflow runs `tsx drive/tests/scripts/scaffold-share-stub.ts`
 *     from the workspace root after `pnpm install`.
 *   - Local: `tinycld-pkg test:e2e` invokes it before booting Playwright.
 *
 * Layout invariant: the workspace root is the parent of drive/, and the
 * script always operates on that root, NOT on cwd. Running from inside
 * drive/ or app/ or the root all behave the same.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const STUB_SLUG = 'share-stub'
const STUB_MIME_TYPE = 'application/x-tinycld-stub'
// Query param the stub's open-in-app action appends to the drive route as a
// race-free "drive invoked the opener" beacon. open-in-app.spec.ts asserts on
// this exact key — keep them in sync.
const STUB_OPEN_PARAM = 'openInApp'
const BOOTSTRAP_VERSION = '@tinycld/bootstrap@2.0.1'

// Hard ceiling for every child process we spawn. pnpm has intermittently
// failed to exit after finishing its work in CI (the step then rode the
// runner's multi-hour default timeout). A spawnSync timeout turns that into
// a fast, attributable failure instead of a silent hang. `run` wraps
// spawnSync so each call enforces it uniformly and surfaces a clear error.
const CHILD_TIMEOUT_MS = 4 * 60_000

function workspaceRoot(): string {
    // drive/tests/scripts/scaffold-share-stub.ts → drive/ → workspace root
    return resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..')
}

// spawnSync with a uniform timeout + non-zero/timeout → throw. spawnSync
// reports a timeout via `error` (an Error whose code is 'ETIMEDOUT') and
// kills the child, so a wedged subprocess can never wedge this script.
function run(cmd: string, args: string[], cwd: string): void {
    const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', timeout: CHILD_TIMEOUT_MS })
    if (r.error) {
        const timedOut = (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
        throw new Error(
            `\`${cmd} ${args.join(' ')}\` ${timedOut ? `timed out after ${CHILD_TIMEOUT_MS}ms` : 'failed'}: ${r.error.message}`
        )
    }
    if (r.status !== 0) {
        throw new Error(`\`${cmd} ${args.join(' ')}\` exited with status ${r.status}`)
    }
}

function ensureBootstrapped(wsRoot: string): void {
    const stubDir = join(wsRoot, STUB_SLUG)
    if (existsSync(stubDir)) {
        console.log(`[scaffold-share-stub] ${STUB_SLUG}/ exists — skipping bootstrap`)
        return
    }
    console.log(`[scaffold-share-stub] running bootstrap to scaffold ${STUB_SLUG}/`)
    // --no-link: bootstrap would otherwise try to assemble app+core (already
    // present) and run pnpm install. The caller is responsible for the
    // install step, so we skip both.
    execFileSync(
        'npx',
        [
            '--yes',
            BOOTSTRAP_VERSION,
            '--new',
            STUB_SLUG,
            '--yes',
            '--preset',
            'settings-only',
            '--name',
            'Share Stub',
            '--description',
            'drive E2E share-editor stub',
            '--no-link',
            '--target',
            stubDir,
        ],
        { stdio: 'inherit', cwd: wsRoot, timeout: CHILD_TIMEOUT_MS }
    )
}

function patchManifest(stubDir: string): void {
    const path = join(stubDir, 'manifest.ts')
    // Replace the scaffolded manifest wholesale. The settings-only template
    // ships a `settings: [...]` array we don't need; we want only a
    // `provider`. Keeping the file shape minimal makes the test fixture
    // legible — anyone reading drive's E2E suite can see exactly what the
    // stub package contributes.
    const contents = `const manifest = {
    name: 'Share Stub',
    slug: '${STUB_SLUG}',
    version: '0.1.0',
    description: 'drive E2E share-editor stub',
    provider: { component: 'provider' },
}

export default manifest
`
    writeFileSync(path, contents)
}

function patchPackageJson(stubDir: string): void {
    const path = join(stubDir, 'package.json')
    const pkg = JSON.parse(readFileSync(path, 'utf8'))
    pkg.exports = {
        ...(pkg.exports ?? {}),
        './provider': `./tinycld/${STUB_SLUG}/provider.tsx`,
        './share-editor': `./tinycld/${STUB_SLUG}/share-editor.tsx`,
    }
    // The provider imports @tinycld/drive (the item-action registry) the same
    // way a real sibling does. nodeLinker:hoisted resolves it from the root
    // node_modules regardless, but declaring it as a peer keeps the stub
    // honest and lets a standalone typecheck resolve the import by name.
    pkg.peerDependencies = {
        ...(pkg.peerDependencies ?? {}),
        '@tinycld/drive': '*',
    }
    writeFileSync(path, `${JSON.stringify(pkg, null, 4)}\n`)
}

function writeProvider(stubDir: string): void {
    const dir = join(stubDir, 'tinycld', STUB_SLUG)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'provider.tsx')
    // The provider registers two stub contributions by side effect at
    // module load:
    //   1. a share-editor for the stub mime type (the share-link specs);
    //   2. an open-in-app DriveItemAction for the stub mime type (the
    //      open-in-app specs).
    // Both mirror how a real sibling (calc/text) contributes to drive,
    // without drive's CI knowing those packages exist. PackageProviderWrapper
    // mounts every package's provider, so these registrations fire before
    // drive consults either registry.
    //
    // The open-in-app action's onPress navigates to the already-mounted drive
    // route with a beacon query param (`?${STUB_OPEN_PARAM}=<id>`) rather than a
    // real editor screen. This proves drive's contract (double-click →
    // resolveOpenAction picks this action → onPress fires) via a URL change,
    // with no dependency on a sibling editor chunk compiling/committing.
    //
    // Why the drive route is safe to beacon onto: drive's only URL writer,
    // usePreviewUrlSync (useDrive.tsx), does a shallow router.setParams of just
    // {file, preview} and short-circuits when both are already absent — so it
    // never strips or races this param. And the drive route is real + warmed,
    // so there's no unknown-route href-interpolation risk a stub path would have.
    const contents = `import { registerShareEditor } from '@tinycld/core/file-viewer/registry'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { registerDriveItemAction } from '@tinycld/drive/lib/item-actions-registry'
import { router } from 'expo-router'
import { ExternalLink } from 'lucide-react-native'
import { lazy, type ReactNode } from 'react'

registerShareEditor('${STUB_MIME_TYPE}', {
    component: lazy(() => import('./share-editor')),
})

registerDriveItemAction('stub.open', () => {
    const orgHref = useOrgHref()
    return {
        id: 'stub.open',
        icon: ExternalLink,
        label: 'Open in Stub',
        isOpener: true,
        isApplicable: item => item.mimeType === '${STUB_MIME_TYPE}',
        onPress: item => {
            router.push(orgHref('drive', { ${STUB_OPEN_PARAM}: item.id }))
        },
    }
})

export default function StubProvider({ children }: { children: ReactNode }) {
    return <>{children}</>
}
`
    writeFileSync(path, contents)
}

function writeShareEditor(stubDir: string): void {
    const path = join(stubDir, 'tinycld', STUB_SLUG, 'share-editor.tsx')
    // The editor renders identifiable text that drive's specs assert on:
    //   - 'Stub share editor' — unambiguous marker that the route mounted
    //     a real editor (NOT the static PublicShareLayout fallback).
    //   - role / identity kind / identity displayName / item name —
    //     drive's spec verifies the SHARE ROUTE handed the editor the
    //     right mount based on the visitor's identity and the link's role.
    //   - canEdit / canComment — drive verifies the capabilities the share
    //     route derived from anon vs guest-commentor vs guest-editor.
    // Each piece of state is rendered with a data-test-id so the spec
    // doesn't depend on visual layout.
    const contents = `import type { EditorMount } from '@tinycld/core/lib/editor/editor-mount'
import { Text, View } from 'react-native'

export default function StubShareEditor({ mount }: { mount: EditorMount }) {
    return (
        <View className="flex-1 p-4 gap-2 bg-background">
            <Text className="text-foreground text-lg font-bold">Stub share editor</Text>
            <Text className="text-foreground" data-test-id="stub-item-name">
                {\`item: \${mount.itemName}\`}
            </Text>
            <Text className="text-foreground" data-test-id="stub-role">
                {\`role: \${mount.role}\`}
            </Text>
            <Text className="text-foreground" data-test-id="stub-identity-kind">
                {\`identity.kind: \${mount.identity.kind}\`}
            </Text>
            <Text className="text-foreground" data-test-id="stub-identity-displayName">
                {\`identity.displayName: \${mount.identity.displayName}\`}
            </Text>
            <Text className="text-foreground" data-test-id="stub-cap-canEdit">
                {\`canEdit: \${String(mount.capabilities.canEdit)}\`}
            </Text>
            <Text className="text-foreground" data-test-id="stub-cap-canComment">
                {\`canComment: \${String(mount.capabilities.canComment)}\`}
            </Text>
        </View>
    )
}
`
    writeFileSync(path, contents)
}

function regenerateConfig(wsRoot: string): void {
    // The generator emits tinycld/tinycld.config.ts from getPackages() output.
    // After adding share-stub to the workspace tree we have to re-run it,
    // otherwise PackageProviderWrapper won't know to mount the stub's
    // provider and getShareEditor() will keep returning undefined. The app
    // shell (which owns packages:generate) lives at <wsRoot>/tinycld.
    run('pnpm', ['run', 'packages:generate'], join(wsRoot, 'tinycld'))
}

function main(): void {
    const wsRoot = workspaceRoot()
    console.log(`[scaffold-share-stub] workspace root: ${wsRoot}`)

    ensureBootstrapped(wsRoot)

    const stubDir = join(wsRoot, STUB_SLUG)
    patchManifest(stubDir)
    patchPackageJson(stubDir)
    writeProvider(stubDir)
    writeShareEditor(stubDir)

    // Re-link as a workspace member. When this triggers an install, that
    // install's postinstall already runs packages:generate — so only
    // regenerate explicitly on the idempotent path (stub already linked, no
    // install). The redundant second `pnpm run packages:generate` was the
    // step that intermittently hung in CI, so we no longer issue it after a
    // fresh install.
    const installed = ensureMember(wsRoot)
    if (!installed) regenerateConfig(wsRoot)

    console.log(`[scaffold-share-stub] done — ${STUB_SLUG}/ ready at ${stubDir}`)
}

// Returns true if it ran a `pnpm install` (whose postinstall regenerates the
// config), false if the stub was already linked and nothing was installed.
function ensureMember(wsRoot: string): boolean {
    const path = join(wsRoot, 'package.json')
    const pkg = JSON.parse(readFileSync(path, 'utf8'))
    const workspaces: string[] = Array.isArray(pkg.workspaces) ? pkg.workspaces : []
    const alreadyMember = workspaces.includes(STUB_SLUG)
    if (!alreadyMember) {
        pkg.workspaces = [...workspaces, STUB_SLUG]
        writeFileSync(path, `${JSON.stringify(pkg, null, 4)}\n`)
    }
    // pnpm discovers members from pnpm-workspace.yaml, so register the stub
    // there too (the package.json workspaces[] is only a tooling hint).
    const added = ensurePnpmMember(join(wsRoot, 'pnpm-workspace.yaml'))
    if (alreadyMember && !added) return false
    // pnpm install relinks workspaces. We piggy-back on the caller's install
    // (CI runs pnpm install before invoking this script); the first-time
    // scaffold path needs a second install to wire the symlink. corepack
    // enable selects the pinned pnpm.
    run('corepack', ['enable'], wsRoot)
    run('pnpm', ['install', '--no-frozen-lockfile'], wsRoot)
    return true
}

// Add `  - <STUB_SLUG>` to pnpm-workspace.yaml's packages: block if absent.
// Returns true if a line was added.
function ensurePnpmMember(yamlPath: string): boolean {
    const yaml = readFileSync(yamlPath, 'utf8')
    const lines = yaml.split('\n')
    const pkgIdx = lines.findIndex(l => /^packages:\s*$/.test(l))
    if (pkgIdx === -1) throw new Error(`no packages: block in ${yamlPath}`)
    let lastEntry = pkgIdx
    for (let i = pkgIdx + 1; i < lines.length; i++) {
        const line = lines[i] ?? ''
        if (line.trim() === `- ${STUB_SLUG}`) return false
        if (/^\s+-\s+/.test(line)) lastEntry = i
        else if (/^\S/.test(line) && line.trim() !== '') break
    }
    lines.splice(lastEntry + 1, 0, `  - ${STUB_SLUG}`)
    writeFileSync(yamlPath, lines.join('\n'))
    return true
}

main()
