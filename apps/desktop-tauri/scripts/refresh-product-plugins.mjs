/** Refresh XiaoHui's external product snapshots from their declared latest channels. */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import semver from 'semver'

import { hashExternalSnapshot, verifyExternalSnapshot } from './bundle-harness-source.mjs'
import {
  applyApprovedPeerOverrides,
  readWorkspacePackageVersions,
  validateProductPlugin,
} from './product-plugin-compatibility.mjs'
import { readPythonProjectMetadata } from './prepare-xiaohui-runtime.mjs'
import { syncProductPlugin } from './sync-product-plugin.mjs'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = join(desktopRoot, '..', '..')
const productRoot = join(desktopRoot, 'product')
const maximumArchiveBytes = 64 * 1024 * 1024
const maximumArchiveEntries = 20_000
const maximumExpandedArchiveBytes = 256 * 1024 * 1024
const requestAttempts = 3
let cachedGitHubToken

const productKinds = new Set(['npm-latest', 'github-branch', 'github-release-pair'])
const commonPluginFields = new Set(['id', 'kind', 'package', 'destination', 'peerOverrides'])
const kindPluginFields = {
  'npm-latest': new Set(),
  'github-branch': new Set(['repository', 'branch']),
  'github-release-pair': new Set([
    'repository',
    'sourcePath',
    'pythonPackage',
    'pythonDestination',
    'pythonSourcePath',
  ]),
}
const identifierPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/
const npmPackageSegment = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?'
const npmPackagePattern = new RegExp(`^(?:@${npmPackageSegment}/)?${npmPackageSegment}$`)
const pythonPackagePattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/
const githubRepositoryPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/
const reservedProductPaths = new Set([
  'DSH_UPSTREAM.json',
  'dsh-update-policy.json',
  'harness-pnpm-lock.yaml',
  'plugin-update-policy.json',
])

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim()
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status ?? 'unknown'}${detail ? `: ${detail}` : ''}`)
  }
  return result.stdout ?? ''
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertOnlyFields(value, allowed, label) {
  const unknown = Object.keys(value).filter(field => !allowed.has(field))
  if (unknown.length > 0) {
    throw new Error(`${label} has unsupported field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`)
  }
}

function validateNpmPackageName(value, label) {
  if (typeof value !== 'string' || value.length > 214 || !npmPackagePattern.test(value)) {
    throw new Error(`${label} must be a valid lowercase npm package name`)
  }
}

function validatePythonPackageName(value, label) {
  if (typeof value !== 'string' || value.length > 214 || !pythonPackagePattern.test(value)) {
    throw new Error(`${label} must be a valid Python package name`)
  }
}

function validateGitHubRepository(value, label) {
  const [owner = '', repository = '', extra] = typeof value === 'string' ? value.split('/') : []
  if (extra !== undefined || owner.length > 39 || repository.length > 100
    || typeof value !== 'string' || !githubRepositoryPattern.test(value)) {
    throw new Error(`${label} must be a GitHub owner/repository name`)
  }
}

function validateGitBranch(value, label) {
  const invalid = typeof value !== 'string'
    || value.length === 0
    || value.length > 255
    || value === '@'
    || value.startsWith('/')
    || value.endsWith('/')
    || value.endsWith('.')
    || value.includes('//')
    || value.includes('..')
    || value.includes('@{')
    || /[\u0000-\u0020\u007f~^:?*[\]\\]/u.test(value)
    || value.split('/').some(segment => segment.startsWith('.') || segment.endsWith('.lock'))
  if (invalid) throw new Error(`${label} must be a valid Git branch name`)
}

function validateSafeRelativePath(value, label, root, inspectExistingComponents = true) {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value) || value.includes('\\')) {
    throw new Error(`${label} must be a safe relative path`)
  }
  const segments = value.split('/')
  if (segments.some(segment => !identifierPattern.test(segment) || segment === '.' || segment === '..')) {
    throw new Error(`${label} must be a safe relative path`)
  }
  const resolvedRoot = resolve(root)
  const target = resolve(resolvedRoot, ...segments)
  const fromRoot = relative(resolvedRoot, target)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`${label} must stay inside ${resolvedRoot}`)
  }
  if (inspectExistingComponents) {
    if (existsSync(resolvedRoot) && lstatSync(resolvedRoot).isSymbolicLink()) {
      throw new Error(`${label} root must not be a symbolic link: ${resolvedRoot}`)
    }
    let current = resolvedRoot
    for (const segment of segments) {
      current = join(current, segment)
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
        throw new Error(`${label} must not traverse a symbolic link: ${current}`)
      }
    }
  }
  return segments.join('/')
}

function validatePeerOverrides(value, label) {
  if (value === undefined) return
  if (!isPlainObject(value)) throw new Error(`${label} must be an object keyed by exact package version`)
  for (const [version, overrides] of Object.entries(value)) {
    if (semver.valid(version) !== version) {
      throw new Error(`${label} key must be an exact semantic version: ${version}`)
    }
    if (!isPlainObject(overrides) || Object.keys(overrides).length === 0) {
      throw new Error(`${label}.${version} must contain at least one peer override`)
    }
    for (const [pattern, range] of Object.entries(overrides)) {
      const wildcardCount = [...pattern].filter(character => character === '*').length
      const sampleName = wildcardCount === 1 && pattern.endsWith('*')
        ? `${pattern.slice(0, -1)}fixture`
        : pattern
      if (wildcardCount > 1 || (wildcardCount === 1 && !pattern.endsWith('*'))
        || !npmPackagePattern.test(sampleName)) {
        throw new Error(`${label}.${version} has invalid peer package pattern: ${pattern}`)
      }
      if (typeof range !== 'string' || semver.validRange(range) === null) {
        throw new Error(`${label}.${version}.${pattern} must be a valid semantic version range`)
      }
    }
  }
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

/**
 * Validate every update-policy field before a managed path or upstream source is touched.
 *
 * @param {unknown} value
 * @param {string} selectedProductRoot
 * @param {string} policyPath
 * @returns {Record<string, unknown>}
 */
export function validateProductUpdatePolicy(
  value,
  selectedProductRoot = productRoot,
  policyPath = join(selectedProductRoot, 'plugin-update-policy.json'),
) {
  if (!isPlainObject(value)) throw new Error(`unsupported XiaoHui product update policy: ${policyPath}`)
  assertOnlyFields(value, new Set(['formatVersion', 'managedNodeVersion', 'plugins']), 'product update policy')
  if (value.formatVersion !== 1
    || typeof value.managedNodeVersion !== 'string'
    || semver.valid(value.managedNodeVersion) !== value.managedNodeVersion
    || !Array.isArray(value.plugins)
    || value.plugins.length === 0) {
    throw new Error(`unsupported XiaoHui product update policy: ${policyPath}`)
  }

  const ids = new Set()
  const packages = new Set()
  const destinations = []
  for (const [index, plugin] of value.plugins.entries()) {
    const label = `product update policy plugin[${index}]`
    if (!isPlainObject(plugin)) throw new Error(`${label} must be an object`)
    if (!productKinds.has(plugin.kind)) throw new Error(`${label}.kind is unsupported: ${plugin.kind ?? '<missing>'}`)
    assertOnlyFields(plugin, new Set([...commonPluginFields, ...kindPluginFields[plugin.kind]]), label)

    if (typeof plugin.id !== 'string' || !identifierPattern.test(plugin.id) || plugin.id === '.' || plugin.id === '..') {
      throw new Error(`${label}.id must be a non-empty single path segment`)
    }
    if (ids.has(plugin.id)) throw new Error(`product update policy has duplicate plugin id: ${plugin.id}`)
    ids.add(plugin.id)

    validateNpmPackageName(plugin.package, `${label}.package`)
    if (packages.has(plugin.package)) throw new Error(`product update policy has duplicate package: ${plugin.package}`)
    packages.add(plugin.package)
    validatePeerOverrides(plugin.peerOverrides, `${label}.peerOverrides`)

    const destination = validateSafeRelativePath(plugin.destination, `${label}.destination`, selectedProductRoot)
    if ([...reservedProductPaths].some(path => pathsOverlap(destination, path))) {
      throw new Error(`${label}.destination is reserved: ${destination}`)
    }
    destinations.push({ label: `${label}.destination`, path: destination })

    if (plugin.kind === 'github-branch') {
      validateGitHubRepository(plugin.repository, `${label}.repository`)
      validateGitBranch(plugin.branch, `${label}.branch`)
    }
    else if (plugin.kind === 'github-release-pair') {
      validateGitHubRepository(plugin.repository, `${label}.repository`)
      validatePythonPackageName(plugin.pythonPackage, `${label}.pythonPackage`)
      validateSafeRelativePath(
        plugin.sourcePath,
        `${label}.sourcePath`,
        join(selectedProductRoot, '.checkout'),
        false,
      )
      validateSafeRelativePath(
        plugin.pythonSourcePath,
        `${label}.pythonSourcePath`,
        join(selectedProductRoot, '.checkout'),
        false,
      )
      const pythonDestination = validateSafeRelativePath(
        plugin.pythonDestination,
        `${label}.pythonDestination`,
        selectedProductRoot,
      )
      if ([...reservedProductPaths].some(path => pathsOverlap(pythonDestination, path))) {
        throw new Error(`${label}.pythonDestination is reserved: ${pythonDestination}`)
      }
      destinations.push({ label: `${label}.pythonDestination`, path: pythonDestination })
    }
  }

  for (let left = 0; left < destinations.length; left += 1) {
    for (let right = left + 1; right < destinations.length; right += 1) {
      if (pathsOverlap(destinations[left].path, destinations[right].path)) {
        throw new Error(
          `${destinations[left].label} overlaps ${destinations[right].label}: ${destinations[left].path} and ${destinations[right].path}`,
        )
      }
    }
  }
  return value
}

/**
 * Read and fully validate XiaoHui's product update policy.
 *
 * @param {string} selectedProductRoot
 * @returns {Record<string, unknown>}
 */
export function readProductUpdatePolicy(selectedProductRoot = productRoot) {
  const selectedPolicyPath = join(selectedProductRoot, 'plugin-update-policy.json')
  let value
  try {
    value = JSON.parse(readFileSync(selectedPolicyPath, 'utf8'))
  }
  catch (error) {
    throw new Error(`cannot read XiaoHui product update policy ${selectedPolicyPath}: ${error.message}`)
  }
  return validateProductUpdatePolicy(value, selectedProductRoot, selectedPolicyPath)
}

function repositoryUrl(value) {
  if (typeof value === 'string') return value.replace(/^git\+/, '').replace(/\.git$/, '')
  if (value && typeof value.url === 'string') return repositoryUrl(value.url)
  return undefined
}

function githubToken() {
  if (cachedGitHubToken !== undefined) return cachedGitHubToken
  const environmentToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (environmentToken) {
    cachedGitHubToken = environmentToken
    return cachedGitHubToken
  }
  const result = spawnSync('gh', ['auth', 'token', '--hostname', 'github.com'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  cachedGitHubToken = result.status === 0 ? result.stdout.trim() : ''
  return cachedGitHubToken
}

function requestHeaders(url) {
  const headers = { 'user-agent': 'xiaohui-harness-release-preparation' }
  if (new URL(url).hostname === 'api.github.com') {
    headers.accept = 'application/vnd.github+json'
    const token = githubToken()
    if (token) headers.authorization = `Bearer ${token}`
  }
  return headers
}

async function pause(milliseconds) {
  await new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
}

async function request(url, fetchImpl) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error(`product update URL must use HTTPS: ${url}`)
  let lastError
  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: requestHeaders(url),
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      return response
    }
    catch (error) {
      lastError = error
      if (attempt < requestAttempts) await pause(250 * attempt)
    }
  }
  throw new Error(`product update request failed after ${requestAttempts} attempts: ${url}: ${lastError?.message ?? lastError}`)
}

async function requestJson(url, fetchImpl) {
  const response = await request(url, fetchImpl)
  return response.json()
}

async function requestArchive(url, fetchImpl) {
  const response = await request(url, fetchImpl)
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > maximumArchiveBytes) throw new Error(`product archive is too large: ${declared} bytes`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0 || bytes.length > maximumArchiveBytes) {
    throw new Error(`product archive size is invalid: ${bytes.length} bytes`)
  }
  return bytes
}

/**
 * Verify Subresource Integrity for a downloaded artifact.
 *
 * @param {Buffer} bytes
 * @param {string} integrity
 */
export function verifyArchiveIntegrity(bytes, integrity) {
  const match = integrity?.match(/^(sha512|sha256)-([A-Za-z0-9+/]+={0,2})$/)
  if (!match) throw new Error(`unsupported product archive integrity: ${integrity ?? '<missing>'}`)
  const actual = createHash(match[1]).update(bytes).digest('base64')
  if (actual !== match[2]) throw new Error(`product archive integrity mismatch: expected ${integrity}`)
}

/**
 * Resolve an npm package's current latest stable artifact.
 *
 * @param {string} packageName
 * @param {typeof fetch} fetchImpl
 */
export async function resolveNpmLatest(packageName, fetchImpl = globalThis.fetch) {
  const metadata = await requestJson(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
    fetchImpl,
  )
  if (metadata.name !== packageName || !semver.valid(metadata.version) || semver.prerelease(metadata.version)) {
    throw new Error(`npm latest metadata is invalid for ${packageName}`)
  }
  if (typeof metadata.dist?.tarball !== 'string' || typeof metadata.dist?.integrity !== 'string') {
    throw new Error(`npm latest artifact metadata is missing for ${packageName}@${metadata.version}`)
  }
  return {
    version: metadata.version,
    source: metadata.dist.tarball,
    integrity: metadata.dist.integrity,
  }
}

/**
 * Resolve a GitHub branch to its immutable head commit.
 *
 * @param {string} repository
 * @param {string} branch
 * @param {typeof fetch} fetchImpl
 */
export async function resolveGitHubBranch(repository, branch, fetchImpl = globalThis.fetch) {
  const value = await requestJson(
    `https://api.github.com/repos/${repository}/branches/${encodeURIComponent(branch)}`,
    fetchImpl,
  )
  if (!/^[0-9a-f]{40}$/.test(value.commit?.sha ?? '')) {
    throw new Error(`GitHub branch head is invalid: ${repository}#${branch}`)
  }
  return { branch, commit: value.commit.sha }
}

async function resolveGitHubTagCommit(repository, tag, fetchImpl) {
  let object = (await requestJson(
    `https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
    fetchImpl,
  )).object
  for (let depth = 0; depth < 5 && object?.type === 'tag'; depth += 1) {
    object = (await requestJson(
      `https://api.github.com/repos/${repository}/git/tags/${object.sha}`,
      fetchImpl,
    )).object
  }
  if (object?.type !== 'commit' || !/^[0-9a-f]{40}$/.test(object.sha ?? '')) {
    throw new Error(`GitHub release tag does not resolve to a commit: ${repository}@${tag}`)
  }
  return object.sha
}

/**
 * Resolve a repository's latest stable GitHub Release and commit.
 *
 * @param {string} repository
 * @param {typeof fetch} fetchImpl
 */
export async function resolveGitHubLatestRelease(repository, fetchImpl = globalThis.fetch) {
  const release = await requestJson(
    `https://api.github.com/repos/${repository}/releases/latest`,
    fetchImpl,
  )
  if (release.draft || release.prerelease || typeof release.tag_name !== 'string') {
    throw new Error(`GitHub latest Release is not stable: ${repository}`)
  }
  const version = release.tag_name.replace(/^v/, '')
  if (!semver.valid(version) || semver.prerelease(version)) {
    throw new Error(`GitHub latest Release tag is not a stable version: ${repository}@${release.tag_name}`)
  }
  const commit = await resolveGitHubTagCommit(repository, release.tag_name, fetchImpl)
  return { tag: release.tag_name, version, commit }
}

/**
 * Reject a latest channel that would move a committed product version backwards.
 *
 * @param {string} packageName
 * @param {string} currentVersion
 * @param {string} nextVersion
 */
export function assertNoDowngrade(packageName, currentVersion, nextVersion) {
  if (!semver.valid(currentVersion)) throw new Error(`committed ${packageName} version is invalid: ${currentVersion}`)
  if (semver.gt(currentVersion, nextVersion)) {
    throw new Error(`${packageName} latest channel would downgrade ${currentVersion} to ${nextVersion}`)
  }
}

function parseTarNumber(field, label) {
  if ((field[0] & 0x80) !== 0) {
    if ((field[0] & 0x40) !== 0) throw new Error(`product archive has negative ${label}`)
    let value = BigInt(field[0] & 0x3f)
    for (const byte of field.subarray(1)) value = (value << 8n) | BigInt(byte)
    return value
  }
  const encoded = field.toString('ascii').replace(/\0.*$/u, '').trim()
  if (encoded === '') return 0n
  if (!/^[0-7]+$/u.test(encoded)) throw new Error(`product archive has invalid ${label}`)
  return BigInt(`0o${encoded}`)
}

function assertTarChecksum(header) {
  const expected = parseTarNumber(header.subarray(148, 156), 'header checksum')
  let actual = 0n
  for (let index = 0; index < header.length; index += 1) {
    actual += BigInt(index >= 148 && index < 156 ? 0x20 : header[index])
  }
  if (actual !== expected) throw new Error('product archive has an invalid tar header checksum')
}

/**
 * Bound a gzip-compressed tar before the system extractor reads it.
 *
 * @param {Buffer} bytes
 * @param {{maximumEntries?: number, maximumExpandedBytes?: number}} limits
 * @returns {{entries: number, expandedBytes: number}}
 */
export function verifyArchiveExtractionLimits(bytes, limits = {}) {
  const maximumEntries = limits.maximumEntries ?? maximumArchiveEntries
  const maximumExpandedBytes = limits.maximumExpandedBytes ?? maximumExpandedArchiveBytes
  if (!Number.isSafeInteger(maximumEntries) || maximumEntries <= 0
    || !Number.isSafeInteger(maximumExpandedBytes) || maximumExpandedBytes <= 0) {
    throw new Error('product archive extraction limits must be positive safe integers')
  }
  const maximumTarBytes = maximumExpandedBytes + (maximumEntries * 1024) + 1024
  if (!Number.isSafeInteger(maximumTarBytes)) {
    throw new Error('product archive extraction limits exceed the safe integer range')
  }

  let tar
  try {
    tar = gunzipSync(bytes, { maxOutputLength: maximumTarBytes })
  }
  catch (error) {
    if (error?.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength|larger than/iu.test(error?.message ?? '')) {
      throw new Error(`product archive exceeds the ${maximumExpandedBytes}-byte expanded size limit`)
    }
    throw new Error(`product archive is not valid gzip data: ${error?.message ?? error}`)
  }
  if (tar.length === 0 || tar.length % 512 !== 0) {
    throw new Error('product archive has an invalid tar block length')
  }

  const maximumExpanded = BigInt(maximumExpandedBytes)
  let entries = 0
  let expandedBytes = 0n
  let offset = 0
  let zeroBlocks = 0
  while (offset < tar.length) {
    const header = tar.subarray(offset, offset + 512)
    const empty = header.every(byte => byte === 0)
    if (empty) {
      zeroBlocks += 1
      offset += 512
      if (zeroBlocks < 2) continue
      if (tar.subarray(offset).some(byte => byte !== 0)) {
        throw new Error('product archive has entries after its end marker')
      }
      return { entries, expandedBytes: Number(expandedBytes) }
    }
    if (zeroBlocks !== 0) throw new Error('product archive has an invalid tar end marker')

    assertTarChecksum(header)
    const size = parseTarNumber(header.subarray(124, 136), 'entry size')
    entries += 1
    if (entries > maximumEntries) {
      throw new Error(`product archive exceeds the ${maximumEntries}-entry limit`)
    }
    expandedBytes += size
    if (expandedBytes > maximumExpanded) {
      throw new Error(`product archive exceeds the ${maximumExpandedBytes}-byte expanded size limit`)
    }
    const paddedSize = ((size + 511n) / 512n) * 512n
    const nextOffset = BigInt(offset + 512) + paddedSize
    if (nextOffset > BigInt(tar.length)) throw new Error('product archive entry exceeds the tar payload')
    if (nextOffset > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('product archive entry offset is unsafe')
    offset = Number(nextOffset)
  }
  throw new Error('product archive has no complete tar end marker')
}

/**
 * Reject archive paths and entry types that the product snapshot does not own.
 *
 * @param {string} archivePath
 */
export function assertSafeArchiveListing(archivePath) {
  const listing = run('tar', ['-tzf', archivePath])
  for (const raw of listing.split(/\r?\n/).filter(Boolean)) {
    const normalized = posix.normalize(raw.replace(/^\.\//, ''))
    if (raw.startsWith('/') || raw.includes('\\') || normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`product archive contains an unsafe path: ${raw}`)
    }
  }
  const verbose = run('tar', ['-tvzf', archivePath])
  for (const line of verbose.split(/\r?\n/).filter(Boolean)) {
    const kind = line.trimStart()[0]
    if (kind !== '-' && kind !== 'd') {
      throw new Error(`product archive contains a non-file entry: ${line}`)
    }
  }
}

function assertPlainTree(root) {
  const visit = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) {
        throw new Error(`product archive contains a symlink: ${relative(root, path)}`)
      }
      if (stat.isDirectory()) visit(path)
      else if (!stat.isFile()) throw new Error(`product archive contains a special file: ${relative(root, path)}`)
    }
  }
  visit(root)
}

function extractArchive(bytes, root, name = 'download.tgz') {
  const archivePath = join(root, name)
  const extracted = join(root, `${name}.extracted`)
  if (bytes.length === 0 || bytes.length > maximumArchiveBytes) {
    throw new Error(`product archive size is invalid: ${bytes.length} bytes`)
  }
  verifyArchiveExtractionLimits(bytes)
  writeFileSync(archivePath, bytes)
  mkdirSync(extracted, { recursive: true })
  assertSafeArchiveListing(archivePath)
  run('tar', ['-xzf', archivePath, '-C', extracted])
  assertPlainTree(extracted)
  return extracted
}

function singleExtractedDirectory(extracted) {
  const entries = readdirSync(extracted, { withFileTypes: true }).filter(entry => entry.isDirectory())
  if (entries.length !== 1) throw new Error(`product archive must contain one root directory, found ${entries.length}`)
  return join(extracted, entries[0].name)
}

function copyDirectory(source, destination) {
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true })
}

function npmPackSnapshot(source, workRoot) {
  const packRoot = join(workRoot, 'npm-pack')
  mkdirSync(packRoot, { recursive: true })
  const output = run('npm', [
    'pack', '--ignore-scripts', '--json', '--pack-destination', packRoot,
  ], {
    cwd: source,
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
  })
  let records
  try {
    records = JSON.parse(output)
  }
  catch {
    throw new Error(`npm pack did not return JSON for ${source}`)
  }
  if (!Array.isArray(records) || records.length !== 1 || typeof records[0].filename !== 'string') {
    throw new Error(`npm pack returned an unexpected artifact list for ${source}`)
  }
  const packed = readFileSync(join(packRoot, records[0].filename))
  return singleExtractedDirectory(extractArchive(packed, workRoot, 'package.tgz'))
}

function readCurrent(destination) {
  const manifest = JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'))
  const provenancePath = join(destination, 'XIAOHUI_UPSTREAM.json')
  const provenance = existsSync(provenancePath)
    ? JSON.parse(readFileSync(provenancePath, 'utf8'))
    : undefined
  return { manifest, provenance }
}

function verifyManagedSnapshot(root, manifest) {
  if (!existsSync(join(root, 'XIAOHUI_UPSTREAM.json'))) {
    throw new Error(`XiaoHui product provenance is missing: ${manifest.name}@${manifest.version}`)
  }
  verifyExternalSnapshot(root, manifest)
}

function writeManifestIfChanged(root, manifest, changes) {
  if (changes.length > 0) {
    writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
}

function writeProvenance(root, provenance) {
  const value = { ...provenance, treeSha256: hashExternalSnapshot(root) }
  writeFileSync(join(root, 'XIAOHUI_UPSTREAM.json'), `${JSON.stringify(value, null, 2)}\n`)
  return value
}

function archiveMetadata(bytes) {
  return {
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    archiveSha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function stageNpmPlugin(policy, roots, fetchImpl) {
  const destination = join(roots.productRoot, policy.destination)
  const current = readCurrent(destination)
  verifyManagedSnapshot(destination, current.manifest)
  const latest = await resolveNpmLatest(policy.package, fetchImpl)
  assertNoDowngrade(policy.package, current.manifest.version, latest.version)
  if (current.manifest.version === latest.version) {
    if (current.provenance?.integrity !== latest.integrity) {
      throw new Error(`${policy.package}@${latest.version} registry integrity changed after it was committed`)
    }
    const work = join(roots.stagingRoot, policy.id)
    const staged = join(work, 'staged')
    copyDirectory(destination, staged)
    const manifest = JSON.parse(readFileSync(join(staged, 'package.json'), 'utf8'))
    const patches = applyApprovedPeerOverrides(manifest, policy)
    if (patches.length > 0) {
      writeManifestIfChanged(staged, manifest, patches)
      validateProductPlugin(staged, policy, roots.workspacePackages, roots.managedNodeVersion)
      writeProvenance(staged, {
        ...current.provenance,
        package: manifest.name,
        version: manifest.version,
        patches,
      })
      return {
        destination,
        staged,
        package: policy.package,
        from: current.manifest.version,
        to: latest.version,
      }
    }
    validateProductPlugin(destination, policy, roots.workspacePackages, roots.managedNodeVersion)
    return undefined
  }

  const bytes = await requestArchive(latest.source, fetchImpl)
  verifyArchiveIntegrity(bytes, latest.integrity)
  const work = join(roots.stagingRoot, policy.id)
  mkdirSync(work, { recursive: true })
  const packageRoot = join(extractArchive(bytes, work), 'package')
  if (!existsSync(packageRoot)) throw new Error(`npm artifact has no package root: ${policy.package}@${latest.version}`)
  const staged = join(work, 'staged')
  copyDirectory(packageRoot, staged)
  const upstreamTreeSha256 = hashExternalSnapshot(staged)
  const manifest = JSON.parse(readFileSync(join(staged, 'package.json'), 'utf8'))
  if (manifest.version !== latest.version) {
    throw new Error(`npm artifact version mismatch for ${policy.package}: expected ${latest.version}, found ${manifest.version}`)
  }
  const patches = applyApprovedPeerOverrides(manifest, policy)
  writeManifestIfChanged(staged, manifest, patches)
  validateProductPlugin(staged, policy, roots.workspacePackages, roots.managedNodeVersion)
  writeProvenance(staged, {
    package: manifest.name,
    version: manifest.version,
    sourceKind: 'npm-latest',
    channel: 'latest',
    source: latest.source,
    integrity: latest.integrity,
    archiveSha256: createHash('sha256').update(bytes).digest('hex'),
    upstreamTreeSha256,
    patches,
    repository: repositoryUrl(manifest.repository),
    license: manifest.license,
  })
  return { destination, staged, package: policy.package, from: current.manifest.version, to: latest.version }
}

async function stageGitHubBranchPlugin(policy, roots, fetchImpl) {
  const destination = join(roots.productRoot, policy.destination)
  const current = readCurrent(destination)
  verifyManagedSnapshot(destination, current.manifest)
  const latest = await resolveGitHubBranch(policy.repository, policy.branch, fetchImpl)
  if (current.provenance?.commit === latest.commit) {
    const work = join(roots.stagingRoot, policy.id)
    const staged = join(work, 'staged')
    copyDirectory(destination, staged)
    const manifest = JSON.parse(readFileSync(join(staged, 'package.json'), 'utf8'))
    const patches = applyApprovedPeerOverrides(manifest, policy)
    if (patches.length > 0) {
      writeManifestIfChanged(staged, manifest, patches)
      validateProductPlugin(staged, policy, roots.workspacePackages, roots.managedNodeVersion)
      writeProvenance(staged, {
        ...current.provenance,
        package: manifest.name,
        version: manifest.version,
        patches,
      })
      return {
        destination,
        staged,
        package: policy.package,
        from: current.manifest.version,
        to: current.manifest.version,
        commit: latest.commit,
      }
    }
    validateProductPlugin(destination, policy, roots.workspacePackages, roots.managedNodeVersion)
    return undefined
  }
  const source = `https://codeload.github.com/${policy.repository}/tar.gz/${latest.commit}`
  const bytes = await requestArchive(source, fetchImpl)
  const metadata = archiveMetadata(bytes)
  const work = join(roots.stagingRoot, policy.id)
  mkdirSync(work, { recursive: true })
  const checkout = singleExtractedDirectory(extractArchive(bytes, work))
  const packageRoot = npmPackSnapshot(checkout, work)
  const staged = join(work, 'staged')
  copyDirectory(packageRoot, staged)
  const upstreamTreeSha256 = hashExternalSnapshot(staged)
  const manifest = JSON.parse(readFileSync(join(staged, 'package.json'), 'utf8'))
  assertNoDowngrade(policy.package, current.manifest.version, manifest.version)
  const patches = applyApprovedPeerOverrides(manifest, policy)
  writeManifestIfChanged(staged, manifest, patches)
  validateProductPlugin(staged, policy, roots.workspacePackages, roots.managedNodeVersion)
  writeProvenance(staged, {
    package: manifest.name,
    version: manifest.version,
    sourceKind: 'github-branch',
    channel: policy.branch,
    source,
    commit: latest.commit,
    integrity: metadata.integrity,
    archiveSha256: metadata.archiveSha256,
    snapshotMethod: 'npm pack file selection from the pinned GitHub commit with lifecycle scripts disabled',
    upstreamTreeSha256,
    patches,
    repository: `https://github.com/${policy.repository}`,
    license: manifest.license,
  })
  return { destination, staged, package: policy.package, from: current.manifest.version, to: manifest.version, commit: latest.commit }
}

async function stageGitHubReleasePair(policy, roots, fetchImpl) {
  const destination = join(roots.productRoot, policy.destination)
  const pythonDestination = join(roots.productRoot, policy.pythonDestination)
  const current = readCurrent(destination)
  verifyManagedSnapshot(destination, current.manifest)
  const currentPython = readPythonProjectMetadata(readFileSync(join(pythonDestination, 'pyproject.toml'), 'utf8'))
  verifyManagedSnapshot(pythonDestination, { name: currentPython.name, version: currentPython.version })
  const latest = await resolveGitHubLatestRelease(policy.repository, fetchImpl)
  assertNoDowngrade(policy.package, current.manifest.version, latest.version)
  if (current.provenance?.commit === latest.commit && current.provenance?.releaseTag === latest.tag) {
    const python = readPythonProjectMetadata(readFileSync(join(pythonDestination, 'pyproject.toml'), 'utf8'))
    if (python.name !== policy.pythonPackage || python.version !== current.manifest.version) {
      throw new Error(`committed Harbor JavaScript/Python versions do not match: ${current.manifest.version} and ${python.version}`)
    }
    const work = join(roots.stagingRoot, policy.id)
    const staged = join(work, 'staged-node')
    copyDirectory(destination, staged)
    const manifest = JSON.parse(readFileSync(join(staged, 'package.json'), 'utf8'))
    const peerPatches = applyApprovedPeerOverrides(manifest, policy)
    if (peerPatches.length > 0) {
      const patches = [
        ...peerPatches,
        'Preserve the XiaoHui bilingual README projection.',
      ]
      writeManifestIfChanged(staged, manifest, peerPatches)
      validateProductPlugin(staged, policy, roots.workspacePackages, roots.managedNodeVersion)
      writeProvenance(staged, {
        ...current.provenance,
        package: manifest.name,
        version: manifest.version,
        patches,
      })
      return [{
        destination,
        staged,
        package: policy.package,
        from: current.manifest.version,
        to: current.manifest.version,
      }]
    }
    validateProductPlugin(destination, policy, roots.workspacePackages, roots.managedNodeVersion)
    return []
  }

  const source = `https://codeload.github.com/${policy.repository}/tar.gz/${latest.commit}`
  const bytes = await requestArchive(source, fetchImpl)
  const metadata = archiveMetadata(bytes)
  const work = join(roots.stagingRoot, policy.id)
  mkdirSync(work, { recursive: true })
  const checkout = singleExtractedDirectory(extractArchive(bytes, work))
  const nodeSource = join(checkout, policy.sourcePath)
  const pythonSource = join(checkout, policy.pythonSourcePath)
  const staged = join(work, 'staged-node')
  const stagedPython = join(work, 'staged-python')
  copyDirectory(destination, staged)
  copyDirectory(pythonDestination, stagedPython)
  syncProductPlugin({
    source: nodeSource,
    pythonSource,
    nodeDestination: staged,
    pythonDestination: stagedPython,
  })

  const manifest = JSON.parse(readFileSync(join(staged, 'package.json'), 'utf8'))
  const python = readPythonProjectMetadata(readFileSync(join(stagedPython, 'pyproject.toml'), 'utf8'))
  if (manifest.version !== latest.version || python.name !== policy.pythonPackage || python.version !== latest.version) {
    throw new Error(
      `Harbor Release ${latest.tag} must contain ${policy.package}@${latest.version} and ${policy.pythonPackage}==${latest.version}; found ${manifest.version} and ${python.name}==${python.version}`,
    )
  }
  const peerPatches = applyApprovedPeerOverrides(manifest, policy)
  const patches = [
    ...peerPatches,
    'Preserve the XiaoHui bilingual README projection.',
  ]
  writeManifestIfChanged(staged, manifest, peerPatches)
  validateProductPlugin(staged, policy, roots.workspacePackages, roots.managedNodeVersion)
  const common = {
    version: latest.version,
    sourceKind: 'github-release-pair',
    channel: 'latest-stable-release',
    source,
    releaseTag: latest.tag,
    commit: latest.commit,
    integrity: metadata.integrity,
    archiveSha256: metadata.archiveSha256,
    repository: `https://github.com/${policy.repository}`,
  }
  writeProvenance(staged, {
    ...common,
    package: manifest.name,
    sourcePath: policy.sourcePath,
    patches,
    license: manifest.license,
  })
  writeProvenance(stagedPython, {
    ...common,
    package: python.name,
    sourcePath: policy.pythonSourcePath,
    patches: ['Preserve the XiaoHui bilingual README projection.'],
    license: manifest.license,
  })
  return [
    { destination, staged, package: policy.package, from: current.manifest.version, to: latest.version },
    { destination: pythonDestination, staged: stagedPython, package: policy.pythonPackage, from: current.manifest.version, to: latest.version },
  ]
}

function managedPaths(policy) {
  const paths = policy.plugins.flatMap(plugin => [
    join(productRoot, plugin.destination),
    ...(plugin.pythonDestination ? [join(productRoot, plugin.pythonDestination)] : []),
  ])
  return [...paths, join(productRoot, 'harness-pnpm-lock.yaml')]
}

function assertManagedPathsClean(policy) {
  const paths = managedPaths(policy).map(path => relative(repositoryRoot, path))
  const output = run('git', ['status', '--porcelain', '--untracked-files=all', '--', ...paths], {
    cwd: repositoryRoot,
  }).trim()
  if (output) {
    throw new Error(`product refresh refuses dirty managed paths; review or commit them first, or pass --allow-dirty:\n${output}`)
  }
}

function applyUpdates(updates) {
  const transaction = mkdtempSync(join(tmpdir(), 'xiaohui-product-rollback-'))
  const backups = []
  try {
    for (const [index, update] of updates.entries()) {
      const backup = join(transaction, String(index))
      if (existsSync(update.destination)) {
        cpSync(update.destination, backup, { recursive: true })
        backups.push({ destination: update.destination, backup, existed: true })
      }
      else {
        backups.push({ destination: update.destination, backup, existed: false })
      }
    }
    for (const update of updates) copyDirectory(update.staged, update.destination)
  }
  catch (error) {
    for (const backup of backups.reverse()) {
      rmSync(backup.destination, { recursive: true, force: true })
      if (backup.existed) cpSync(backup.backup, backup.destination, { recursive: true })
    }
    throw error
  }
  finally {
    rmSync(transaction, { recursive: true, force: true })
  }
}

/**
 * Refresh every external XiaoHui product source, applying only an all-valid set.
 *
 * @param {{allowDirty?: boolean, dryRun?: boolean, fetchImpl?: typeof fetch, desktop?: string, repository?: string}} options
 */
export async function refreshProductPlugins(options = {}) {
  const selectedDesktopRoot = options.desktop ?? desktopRoot
  const selectedRepositoryRoot = options.repository ?? repositoryRoot
  const selectedProductRoot = join(selectedDesktopRoot, 'product')
  const policy = readProductUpdatePolicy(selectedProductRoot)
  if (!options.allowDirty && selectedDesktopRoot === desktopRoot) assertManagedPathsClean(policy)

  const stagingRoot = mkdtempSync(join(tmpdir(), 'xiaohui-product-refresh-'))
  const roots = {
    productRoot: selectedProductRoot,
    stagingRoot,
    workspacePackages: readWorkspacePackageVersions(selectedRepositoryRoot),
    managedNodeVersion: policy.managedNodeVersion,
  }
  const updates = []
  try {
    for (const plugin of policy.plugins) {
      if (plugin.kind === 'npm-latest') {
        const update = await stageNpmPlugin(plugin, roots, options.fetchImpl ?? globalThis.fetch)
        if (update) updates.push(update)
      }
      else if (plugin.kind === 'github-branch') {
        const update = await stageGitHubBranchPlugin(plugin, roots, options.fetchImpl ?? globalThis.fetch)
        if (update) updates.push(update)
      }
      else if (plugin.kind === 'github-release-pair') {
        updates.push(...await stageGitHubReleasePair(plugin, roots, options.fetchImpl ?? globalThis.fetch))
      }
      else {
        throw new Error(`unsupported XiaoHui product update kind: ${plugin.kind}`)
      }
    }
    if (!options.dryRun) applyUpdates(updates)
    return updates.map(({ staged: _staged, destination, ...update }) => ({
      ...update,
      destination: relative(selectedRepositoryRoot, destination),
    }))
  }
  finally {
    rmSync(stagingRoot, { recursive: true, force: true })
  }
}

async function main() {
  const allowDirty = process.argv.includes('--allow-dirty')
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--check')
  const updates = await refreshProductPlugins({ allowDirty, dryRun })
  if (updates.length === 0) {
    console.log('refresh-product-plugins: all external product snapshots are current and pass static checks')
    return
  }
  for (const update of updates) {
    const suffix = update.commit ? ` (${update.commit.slice(0, 12)})` : ''
    console.log(`refresh-product-plugins: ${update.package} ${update.from} -> ${update.to}${suffix}`)
  }
  if (dryRun) {
    console.log('refresh-product-plugins: dry-run candidates pass static checks; committed product sources were not changed')
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main().catch(error => {
    console.error(`refresh-product-plugins: ${error.message}`)
    process.exitCode = 1
  })
}
