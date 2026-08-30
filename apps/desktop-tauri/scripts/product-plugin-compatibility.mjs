/** Compatibility checks shared by XiaoHui product refresh and release preparation. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import semver from 'semver'

import { hashExternalSnapshot } from './bundle-harness-source.mjs'

/** @param {string} name @returns {boolean} */
export function isBundledRuntimePackage(name) {
  return name === '@deepseek-ai/cordis' || name.startsWith('@deepseek-ai/dsh-')
}

/**
 * Read package versions available in the trimmed XiaoHui workspace.
 *
 * @param {string} repositoryRoot
 * @returns {Map<string, {version: string, root: string}>}
 */
export function readWorkspacePackageVersions(repositoryRoot) {
  const result = new Map()
  const manifests = [
    join(repositoryRoot, 'apps', 'cli', 'package.json'),
    join(repositoryRoot, 'apps', 'web', 'package.json'),
    join(repositoryRoot, 'native', 'landlock-run', 'package.json'),
  ]
  const addChildren = parent => {
    if (!existsSync(parent)) return
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(join(parent, entry.name, 'package.json'))
    }
  }
  addChildren(join(repositoryRoot, 'vendor'))
  addChildren(join(repositoryRoot, 'native', 'landlock-run', 'packages'))
  const groups = join(repositoryRoot, 'packages')
  if (existsSync(groups)) {
    for (const group of readdirSync(groups, { withFileTypes: true })) {
      if (group.isDirectory()) addChildren(join(groups, group.name))
    }
  }

  for (const path of manifests) {
    if (!existsSync(path)) continue
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof manifest.name === 'string' && typeof manifest.version === 'string') {
      result.set(manifest.name, { version: manifest.version, root: dirname(path) })
    }
  }
  return result
}

/**
 * Apply a version-specific, reviewed peer-metadata correction.
 *
 * @param {Record<string, unknown>} manifest
 * @param {Record<string, unknown>} policy
 * @returns {string[]}
 */
export function applyApprovedPeerOverrides(manifest, policy) {
  const overrides = policy.peerOverrides?.[manifest.version]
  if (!overrides) return []
  const peers = manifest.peerDependencies ?? {}
  const changes = []

  for (const [pattern, replacement] of Object.entries(overrides)) {
    if (typeof replacement !== 'string' || replacement === '') {
      throw new Error(`invalid approved peer override for ${manifest.name}@${manifest.version}: ${pattern}`)
    }
    const names = pattern.endsWith('*')
      ? Object.keys(peers).filter(name => name.startsWith(pattern.slice(0, -1)))
      : [pattern]
    if (names.length === 0 || names.some(name => typeof peers[name] !== 'string')) {
      throw new Error(`approved peer override no longer matches ${manifest.name}@${manifest.version}: ${pattern}`)
    }
    for (const name of names) {
      const previous = peers[name]
      if (previous === replacement) continue
      peers[name] = replacement
      changes.push(`Set ${name} peer range from ${previous} to ${replacement}.`)
    }
  }
  manifest.peerDependencies = peers
  return changes
}

function exportedPath(manifest, key) {
  const value = manifest.exports?.[key]
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    if (typeof value.default === 'string') return value.default
    if (typeof value.import === 'string') return value.import
  }
  return undefined
}

/**
 * Resolve a manifest entry without allowing it to escape the candidate package.
 *
 * @param {string} root
 * @param {string} entry
 * @returns {string}
 */
function resolvePackageEntry(root, entry) {
  if (isAbsolute(entry)) throw new Error(`absolute package entry is not allowed: ${entry}`)
  const target = resolve(root, entry)
  const rel = relative(root, target)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`package entry escapes its snapshot: ${entry}`)
  }
  return target
}

/**
 * Reject a product snapshot that cannot share XiaoHui's bundled runtime.
 *
 * @param {string} root
 * @param {Record<string, unknown>} policy
 * @param {Map<string, {version: string, root: string}>} workspacePackages
 * @param {string} managedNodeVersion
 * @returns {Record<string, unknown>}
 */
export function validateProductPlugin(root, policy, workspacePackages, managedNodeVersion) {
  const manifestPath = join(root, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`product plugin package.json missing: ${manifestPath}`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== policy.package) {
    throw new Error(`expected ${policy.package}, found ${manifest.name ?? '<missing>'}`)
  }
  if (!semver.valid(manifest.version)) {
    throw new Error(`invalid product plugin version: ${manifest.name}@${manifest.version ?? '<missing>'}`)
  }
  if (manifest.engines?.node
    && !semver.satisfies(managedNodeVersion, manifest.engines.node, { includePrerelease: true })) {
    throw new Error(
      `${manifest.name}@${manifest.version} requires Node ${manifest.engines.node}; XiaoHui bundles ${managedNodeVersion}`,
    )
  }
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml'
    || !existsSync(join(root, 'cordis.patch.yml'))) {
    throw new Error(`${manifest.name}@${manifest.version} has no usable DSH bundle patch`)
  }
  if (typeof manifest.license !== 'string' || manifest.license === '' || !existsSync(join(root, 'LICENSE'))) {
    throw new Error(`${manifest.name}@${manifest.version} has no bundled license`)
  }

  const hostEntry = manifest.main ?? exportedPath(manifest, '.')
  if (typeof hostEntry !== 'string' || !existsSync(resolvePackageEntry(root, hostEntry))) {
    throw new Error(`${manifest.name}@${manifest.version} has no built Host entry`)
  }
  if (manifest.dsh?.client) {
    const clientEntry = exportedPath(manifest, './client') ?? './lib/client.js'
    if (!existsSync(resolvePackageEntry(root, clientEntry))) {
      throw new Error(`${manifest.name}@${manifest.version} has no built Client entry`)
    }
  }

  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (isBundledRuntimePackage(name)) {
      throw new Error(`${manifest.name}@${manifest.version} bundles runtime dependency ${name}; it must be a peer`)
    }
  }
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!isBundledRuntimePackage(name)) continue
    const workspace = workspacePackages.get(name)
    if (!workspace) throw new Error(`${manifest.name}@${manifest.version} requires missing bundled peer ${name}`)
    if (!semver.validRange(range) || !semver.satisfies(workspace.version, range)) {
      throw new Error(
        `${manifest.name}@${manifest.version} requires ${name}@${range}; XiaoHui bundles ${workspace.version}`,
      )
    }
  }
  for (const name of manifest.dsh?.client?.inject ?? []) {
    if (!workspacePackages.has(name)) {
      throw new Error(`${manifest.name}@${manifest.version} injects missing Client package ${name}`)
    }
  }
  hashExternalSnapshot(root)
  return manifest
}

function unquoteYamlScalar(value) {
  const trimmed = value.trim()
  if ((trimmed.startsWith("'") && trimmed.endsWith("'"))
    || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Parse dependency versions from one pnpm lockfile importer.
 *
 * @param {string} lockfile
 * @param {string} importer
 * @returns {Map<string, string>}
 */
export function readLockImporterVersions(lockfile, importer) {
  const lines = lockfile.split(/\r?\n/)
  const marker = `  ${importer}:`
  const start = lines.findIndex(line => line === marker)
  if (start === -1) throw new Error(`product lockfile importer missing: ${importer}`)
  const versions = new Map()
  let dependency
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^  \S/.test(line)) break
    const key = line.match(/^      (.+):$/)
    if (key) {
      dependency = unquoteYamlScalar(key[1])
      continue
    }
    const version = line.match(/^        version:\s+(.+)$/)
    if (version && dependency) versions.set(dependency, unquoteYamlScalar(version[1]))
  }
  return versions
}

/**
 * Prove every DSH/Cordis product peer resolves to the matching bundled package.
 *
 * @param {string} bundleRoot
 * @returns {number}
 */
export function assertBundledProductPeerLinks(bundleRoot) {
  const lockfile = readFileSync(join(bundleRoot, 'pnpm-lock.yaml'), 'utf8')
  const productRoot = join(bundleRoot, 'packages', 'product')
  let checked = 0
  for (const entry of readdirSync(productRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pluginRoot = join(productRoot, entry.name)
    const manifestPath = join(pluginRoot, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const importer = `packages/product/${entry.name}`
    const versions = readLockImporterVersions(lockfile, importer)
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      if (!isBundledRuntimePackage(name)) continue
      const version = versions.get(name)
      if (!version?.startsWith('link:')) {
        throw new Error(`${manifest.name}@${manifest.version} resolves ${name} outside the bundled workspace: ${version ?? '<missing>'}`)
      }
      const target = resolve(pluginRoot, version.slice('link:'.length))
      const targetManifestPath = join(target, 'package.json')
      if (!existsSync(targetManifestPath)) {
        throw new Error(`${manifest.name}@${manifest.version} has broken workspace peer link ${name}: ${version}`)
      }
      const targetManifest = JSON.parse(readFileSync(targetManifestPath, 'utf8'))
      if (targetManifest.name !== name) {
        throw new Error(`${manifest.name}@${manifest.version} links ${name} to ${targetManifest.name ?? '<missing>'}`)
      }
      checked += 1
    }
  }
  if (checked === 0) throw new Error('no XiaoHui product runtime peer links were checked')
  return checked
}
