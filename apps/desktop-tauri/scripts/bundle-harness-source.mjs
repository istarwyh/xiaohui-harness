/**
 * Bundle a trimmed harness monorepo slice for the Tauri installer.
 *
 * Ships source + pre-built lib/dist artifacts, never node_modules. The
 * committed product lockfile is verified before an offline pnpm store is
 * attached by prepare-harness-offline-store.mjs.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(desktopRoot, '..', '..')
const outRoot = join(desktopRoot, 'bundled', 'harness')
const productLockPath = join(desktopRoot, 'product', 'harness-pnpm-lock.yaml')
const productPlugins = [
  {
    name: 'dsh-harbor-evolution',
    root: join(desktopRoot, 'product', 'harbor-evolution'),
    destination: join('packages', 'product', 'harbor-evolution'),
  },
  {
    name: 'dsh-codex-auth',
    root: join(desktopRoot, 'product', 'dsh-codex-auth'),
    destination: join('packages', 'product', 'dsh-codex-auth'),
  },
  {
    name: 'dsh-better-sidebar',
    root: join(desktopRoot, 'product', 'dsh-better-sidebar'),
    destination: join('packages', 'product', 'dsh-better-sidebar'),
  },
  {
    name: 'dsh-context-doctor',
    root: join(desktopRoot, 'product', 'context-doctor'),
    destination: join('packages', 'product', 'context-doctor'),
  },
  {
    name: 'dsh-personal-workbench',
    root: join(desktopRoot, 'product', 'personal-workbench'),
    destination: join('packages', 'product', 'personal-workbench'),
  },
]

const skipDirNames = new Set([
  'node_modules', '.git', '.turbo', 'coverage', 'release', '.stage', '.cache',
  'tests', 'test', '__tests__', 'dist-test',
])

const trimmedPackages = [
  'vendor/*',
  'packages/*/*',
  'native/landlock-run',
  'native/landlock-run/packages/*',
  'apps/cli',
  'apps/web',
]

const skipPackageGroups = new Set(['examples', 'test-support', 'experimental'])

const skipFileSuffixes = ['.spec.ts', '.e2e.ts', '.snapshot.ts']

/**
 * Derive the bundled pnpm-workspace.yaml from the repository's own file,
 * replacing only the `packages:` membership. Every other section —
 * `patchedDependencies`, `allowBuilds`, overrides — is copied verbatim so a
 * stale hardcoded copy can never disagree with the source tree the bundle
 * ships; pnpm treats a declared-but-unused patch as a hard install error.
 *
 * @param {string} sourceYaml
 * @returns {string}
 */
export function buildTrimmedWorkspaceYaml(sourceYaml) {
  const lines = sourceYaml.split(/\r?\n/)
  const packagesIndex = lines.findIndex(line => /^packages:\s*$/.test(line))
  if (packagesIndex === -1) {
    throw new Error('pnpm-workspace.yaml has no packages: block to trim')
  }
  let end = packagesIndex + 1
  while (end < lines.length && (lines[end].trim() === '' || /^[ \t]/.test(lines[end]))) {
    end += 1
  }
  const trimmedBlock = [
    'packages:',
    ...trimmedPackages.map(name => `  - ${name}`),
    '',
  ]
  return [...lines.slice(0, packagesIndex), ...trimmedBlock, ...lines.slice(end)].join('\n')
}

/** @param {string} sourceRoot @param {string} source */
function shouldCopyEntry(sourceRoot, source) {
  const rel = relative(sourceRoot, source)
  if (rel === '') return true
  const parts = rel.split(sep)
  if (parts.some(part => skipDirNames.has(part))) return false
  const base = parts[parts.length - 1]
  if (skipFileSuffixes.some(suffix => base.endsWith(suffix))) return false
  if (base.startsWith('README') && parts.length > 2) return false
  return true
}

/** @param {string} sourceRoot @param {string} current @param {import('node:crypto').Hash} hasher @param {string} relPrefix */
function hashSourceWalk(sourceRoot, current, hasher, relPrefix) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name)
    if (!shouldCopyEntry(sourceRoot, path)) continue
    if (entry.isDirectory()) {
      const dirRel = relPrefix ? `${relPrefix}/${entry.name}`.replaceAll('\\', '/') : entry.name.replaceAll('\\', '/')
      hashSourceWalk(sourceRoot, path, hasher, dirRel)
      continue
    }
    if (!entry.isFile()) continue
    const rel = relPrefix ? `${relPrefix}/${entry.name}`.replaceAll('\\', '/') : entry.name.replaceAll('\\', '/')
    hasher.update(rel)
    if (entry.name === 'package.json') {
      const pkg = JSON.parse(readFileSync(path, 'utf8'))
      delete pkg.devDependencies
      hasher.update(JSON.stringify(pkg, null, 2))
    }
    else {
      hasher.update(readFileSync(path))
    }
  }
}

/** Hash the same source slices we copy into the installer bundle. */
function hashBundledContent(trimmedWorkspace, bundlePkg, productLock) {
  const hasher = createHash('sha256')

  for (const name of ['package.json', 'pnpm-workspace.yaml']) {
    const path = join(repoRoot, name)
    if (!existsSync(path)) continue
    hasher.update(name)
    if (name === 'package.json') {
      hasher.update(JSON.stringify(bundlePkg, null, 2))
    }
    else {
      hasher.update(readFileSync(path))
    }
  }
  hasher.update('pnpm-lock.yaml')
  hasher.update(productLock)

  for (const rel of ['patches', 'vendor', join('native', 'landlock-run'), join('apps', 'cli'), join('apps', 'web')]) {
    const path = join(repoRoot, rel)
    if (existsSync(path)) {
      hashSourceWalk(path, path, hasher, rel.replaceAll('\\', '/'))
    }
  }

  const packagesRoot = join(repoRoot, 'packages')
  for (const group of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!group.isDirectory() || skipPackageGroups.has(group.name)) continue
    const groupPath = join(packagesRoot, group.name)
    for (const pkg of readdirSync(groupPath, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue
      const rel = `packages/${group.name}/${pkg.name}`
      hashSourceWalk(join(groupPath, pkg.name), join(groupPath, pkg.name), hasher, rel)
    }
  }

  for (const plugin of productPlugins) {
    hashSourceWalk(plugin.root, plugin.root, hasher, plugin.destination)
    hasher.update(plugin.name)
    hasher.update('workspace:*')
  }

  hasher.update(trimmedWorkspace)
  return hasher.digest('hex')
}

/** Hash an external plugin snapshot without its XiaoHui provenance sidecar. */
export function hashExternalSnapshot(root) {
  const hasher = createHash('sha256')

  /** @param {string} current @param {string} prefix */
  const walk = (current, prefix) => {
    const entries = readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (prefix === '' && entry.name === 'XIAOHUI_UPSTREAM.json') continue
      const path = join(current, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) {
        throw new Error(`external plugin snapshot must not contain symlinks: ${rel}`)
      }
      if (entry.isDirectory()) {
        walk(path, rel)
        continue
      }
      if (!entry.isFile()) continue
      const mode = statSync(path).mode & 0o777
      hasher.update(`${rel}\0${mode.toString(8)}\0`)
      hasher.update(readFileSync(path))
      hasher.update('\0')
    }
  }

  walk(root, '')
  return hasher.digest('hex')
}

/** Verify the committed package still matches its reviewed external snapshot. */
export function verifyExternalSnapshot(root, manifest) {
  const provenancePath = join(root, 'XIAOHUI_UPSTREAM.json')
  if (!existsSync(provenancePath)) return
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'))
  if (provenance.package !== manifest.name || provenance.version !== manifest.version) {
    throw new Error(
      `XiaoHui product provenance mismatch for ${manifest.name}@${manifest.version}`,
    )
  }
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(provenance.integrity ?? '')) {
    throw new Error(`XiaoHui product integrity is invalid: ${manifest.name}`)
  }
  const actual = hashExternalSnapshot(root)
  if (actual !== provenance.treeSha256) {
    throw new Error(
      `XiaoHui product snapshot hash mismatch for ${manifest.name}: expected ${provenance.treeSha256}, found ${actual}`,
    )
  }
}

/** Names available from the copied monorepo rather than the external registry. */
function bundledWorkspacePackageNames(bundleRoot) {
  const manifests = [
    join(bundleRoot, 'apps', 'cli', 'package.json'),
    join(bundleRoot, 'apps', 'web', 'package.json'),
    join(bundleRoot, 'native', 'landlock-run', 'package.json'),
  ]

  for (const parent of [
    join(bundleRoot, 'vendor'),
    join(bundleRoot, 'native', 'landlock-run', 'packages'),
  ]) {
    if (!existsSync(parent)) continue
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(join(parent, entry.name, 'package.json'))
    }
  }

  const packagesRoot = join(bundleRoot, 'packages')
  if (existsSync(packagesRoot)) {
    for (const group of readdirSync(packagesRoot, { withFileTypes: true })) {
      if (!group.isDirectory()) continue
      const groupRoot = join(packagesRoot, group.name)
      for (const entry of readdirSync(groupRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) manifests.push(join(groupRoot, entry.name, 'package.json'))
      }
    }
  }

  const names = new Set()
  for (const manifestPath of manifests) {
    if (!existsSync(manifestPath)) continue
    const name = JSON.parse(readFileSync(manifestPath, 'utf8')).name
    if (typeof name === 'string' && name !== '') names.add(name)
  }
  return names
}

/** Install XiaoHui's product plugins into the trimmed workspace closure. */
export function installProductPlugins(bundleRoot) {
  const cliManifestPath = join(bundleRoot, 'apps', 'cli', 'package.json')
  const cliManifest = JSON.parse(readFileSync(cliManifestPath, 'utf8'))
  const manifests = []

  for (const plugin of productPlugins) {
    const productManifest = join(plugin.root, 'package.json')
    if (!existsSync(productManifest)) {
      throw new Error(`XiaoHui product plugin missing: ${productManifest}`)
    }
    const manifest = JSON.parse(readFileSync(productManifest, 'utf8'))
    if (manifest.name !== plugin.name) {
      throw new Error(
        `XiaoHui product plugin name mismatch: expected ${plugin.name}, found ${manifest.name ?? '<missing>'}`,
      )
    }
    if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
      throw new Error(`XiaoHui product plugin has no DSH bundle patch: ${plugin.name}`)
    }
    verifyExternalSnapshot(plugin.root, manifest)

    copyTree(plugin.root, join(bundleRoot, plugin.destination))
    manifests.push(manifest)
    cliManifest.dependencies = {
      ...cliManifest.dependencies,
      [plugin.name]: 'workspace:*',
    }
  }

  const workspaceNames = bundledWorkspacePackageNames(bundleRoot)
  for (const manifest of manifests) {
    for (const peerName of Object.keys(manifest.peerDependencies ?? {})) {
      if (workspaceNames.has(peerName)) cliManifest.dependencies[peerName] = 'workspace:*'
    }
  }

  writeFileSync(cliManifestPath, `${JSON.stringify(cliManifest, null, 2)}\n`)
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyTree(src, dest) {
  if (!existsSync(src)) return
  if (statSync(src).isFile()) {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    return
  }
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, {
    recursive: true,
    dereference: true,
    filter: candidate => shouldCopyEntry(src, candidate),
  })
}

function assertBuiltArtifacts() {
  const cliBin = join(repoRoot, 'apps', 'cli', 'lib', 'bin.js')
  const webIndex = join(repoRoot, 'apps', 'web', 'dist', 'index.html')
  const landlockEntry = join(repoRoot, 'native', 'landlock-run', 'packages', 'entry', 'lib', 'index.js')
  if (!existsSync(cliBin) || !existsSync(webIndex)) {
    throw new Error(
      'Harness build artifacts missing. From repo root run: pnpm run build',
    )
  }
  if (!existsSync(landlockEntry)) {
    throw new Error(
      'landlock-run entry lib missing. From native/landlock-run run: pnpm run build:ts',
    )
  }
  const buildRecordPath = join(repoRoot, '.dsh-build', 'client-build-environment.json')
  if (!existsSync(buildRecordPath)) {
    throw new Error('Harness client build record missing. Run the XiaoHui-branded root build first.')
  }
  const buildRecord = JSON.parse(readFileSync(buildRecordPath, 'utf8'))
  if (buildRecord.environment?.DSH_CLIENT_TITLE !== 'XiaoHui Harness') {
    throw new Error(
      'Harness client artifacts are not branded for XiaoHui. Run: DSH_CLIENT_TITLE="XiaoHui Harness" pnpm run build',
    )
  }
  if (!existsSync(productLockPath)) {
    throw new Error(`XiaoHui frozen Harness lockfile missing: ${productLockPath}`)
  }
}

/** Strip devDependencies so first-run `pnpm install --prod` never resolves demo/test-only workspace refs. */
function stripDevDependencies(root) {
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (skipDirNames.has(entry.name)) continue
        walk(path)
        continue
      }
      if (entry.name !== 'package.json') continue
      if (!existsSync(path)) continue
      const pkg = JSON.parse(readFileSync(path, 'utf8'))
      if (!pkg.devDependencies) continue
      delete pkg.devDependencies
      writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
    }
  }
  walk(root)
}

/** @param {string} dir */
function removeTree(dir) {
  if (!existsSync(dir)) return
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  } catch (error) {
    if (process.platform === 'win32') {
      execSync(`cmd /c rmdir /s /q "${dir.replaceAll('/', '\\')}"`, { stdio: 'ignore' })
      return
    }
    throw error
  }
}

function main() {
assertBuiltArtifacts()
removeTree(outRoot)
mkdirSync(outRoot, { recursive: true })

for (const name of ['package.json', 'pnpm-workspace.yaml']) {
  copyTree(join(repoRoot, name), join(outRoot, name))
}
copyTree(productLockPath, join(outRoot, 'pnpm-lock.yaml'))

if (existsSync(join(repoRoot, 'patches'))) {
  copyTree(join(repoRoot, 'patches'), join(outRoot, 'patches'))
}

copyTree(join(repoRoot, 'vendor'), join(outRoot, 'vendor'))
copyTree(join(repoRoot, 'native', 'landlock-run'), join(outRoot, 'native', 'landlock-run'))
copyTree(join(repoRoot, 'apps', 'cli'), join(outRoot, 'apps', 'cli'))
copyTree(join(repoRoot, 'apps', 'web'), join(outRoot, 'apps', 'web'))

const packagesRoot = join(repoRoot, 'packages')
for (const group of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!group.isDirectory()) continue
  if (skipPackageGroups.has(group.name)) continue
  const groupPath = join(packagesRoot, group.name)
  for (const pkg of readdirSync(groupPath, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue
    copyTree(join(groupPath, pkg.name), join(outRoot, 'packages', group.name, pkg.name))
  }
}
installProductPlugins(outRoot)

const trimmedWorkspace = buildTrimmedWorkspaceYaml(
  readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'),
)
writeFileSync(join(outRoot, 'pnpm-workspace.yaml'), trimmedWorkspace)

const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const productLock = readFileSync(productLockPath)
const bundlePkg = {
  name: '@deepseek-ai/dsh-desktop-bundle',
  private: true,
  version: rootPkg.version,
  packageManager: rootPkg.packageManager ?? 'pnpm@11.7.0',
}
writeFileSync(join(outRoot, 'package.json'), `${JSON.stringify(bundlePkg, null, 2)}\n`)

stripDevDependencies(outRoot)

const manifest = {
  harnessVersion: rootPkg.version,
  product: 'XiaoHui Harness',
  productPlugins: productPlugins.map(plugin => {
    const pkg = JSON.parse(readFileSync(join(plugin.root, 'package.json'), 'utf8'))
    return `${plugin.name}@${pkg.version}`
  }),
  bundledAt: new Date().toISOString(),
  contentSha256: hashBundledContent(trimmedWorkspace, bundlePkg, productLock),
  method: 'trimmed-monorepo-source-frozen-lock',
}
writeFileSync(join(outRoot, '.bundle-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`bundle-harness-source: wrote ${outRoot}`)
console.log(`bundle-harness-source: sha256=${manifest.contentSha256}`)
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main()
}
