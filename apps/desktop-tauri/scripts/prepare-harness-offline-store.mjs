/** Build the production-only pnpm store shipped inside the Harness resource. */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const harnessRoot = join(desktopRoot, 'bundled', 'harness')
const storeRoot = join(harnessRoot, '.xiaohui-pnpm-store')
const storeArchiveName = 'xiaohui-pnpm-store.tar.gz'
const storeArchivePath = join(harnessRoot, storeArchiveName)
const MIN_PRODUCT_STORE_FILES = 1_000

function runPnpm(args) {
  const npmExecPath = process.env.npm_execpath
  const invocation = npmExecPath && /\.[cm]?js$/i.test(npmExecPath)
    ? [process.execPath, [npmExecPath, ...args]]
    : ['pnpm', args]
  const result = spawnSync(invocation[0], invocation[1], {
    cwd: harnessRoot,
    env: { ...process.env, CI: 'true' },
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(' ')} failed with exit ${result.status ?? 'unknown'}`)
  }
}

/** Deterministic digest of a generated directory tree. */
export function hashTree(root) {
  const hasher = createHash('sha256')
  let files = 0

  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name)
      const rel = relative(root, path).replaceAll('\\', '/')
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) throw new Error(`offline pnpm store must not contain symlinks: ${rel}`)
      if (stat.isDirectory()) {
        walk(path)
        continue
      }
      if (!stat.isFile()) continue
      hasher.update(`${rel}\0${(stat.mode & 0o777).toString(8)}\0`)
      hasher.update(readFileSync(path))
      hasher.update('\0')
      files += 1
    }
  }

  walk(root)
  return { files, sha256: hasher.digest('hex') }
}

export function finalizeOfflineManifest(manifest, storeDigest, archiveSha256) {
  const sourceSha256 = manifest.sourceSha256 ?? manifest.contentSha256
  if (!/^[0-9a-f]{64}$/.test(sourceSha256 ?? '')) {
    throw new Error('bundled Harness source digest is missing before offline store preparation')
  }
  if (storeDigest.files < 1 || !/^[0-9a-f]{64}$/.test(storeDigest.sha256)) {
    throw new Error('offline pnpm store is empty or has an invalid digest')
  }
  if (!/^[0-9a-f]{64}$/.test(archiveSha256 ?? '')) {
    throw new Error('offline pnpm store archive has an invalid digest')
  }
  const contentSha256 = createHash('sha256')
    .update(sourceSha256)
    .update('\0')
    .update(storeDigest.sha256)
    .update('\0')
    .update(archiveSha256)
    .digest('hex')
  return {
    ...manifest,
    sourceSha256,
    offlineStore: {
      path: storeArchiveName,
      expandedPath: '.xiaohui-pnpm-store',
      files: storeDigest.files,
      sha256: storeDigest.sha256,
      archiveSha256,
    },
    contentSha256,
    method: 'trimmed-monorepo-source-frozen-lock+offline-pnpm-store',
  }
}

function fileSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function packageExistingOfflineStore() {
  const manifestPath = join(harnessRoot, '.bundle-manifest.json')
  const digest = hashTree(storeRoot)
  if (digest.files < MIN_PRODUCT_STORE_FILES) {
    throw new Error(`offline pnpm store is incomplete: expected at least ${MIN_PRODUCT_STORE_FILES} files, got ${digest.files}`)
  }

  rmSync(storeArchivePath, { force: true })
  const archive = spawnSync('tar', ['--no-mac-metadata', '-czf', storeArchivePath, '-C', harnessRoot, '.xiaohui-pnpm-store'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    stdio: 'inherit',
  })
  if (archive.status !== 0) {
    throw new Error(`tar failed with exit ${archive.status ?? 'unknown'}`)
  }
  const archiveSha256 = fileSha256(storeArchivePath)
  rmSync(storeRoot, { recursive: true, force: true })

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const finalized = finalizeOfflineManifest(manifest, digest, archiveSha256)
  writeFileSync(manifestPath, `${JSON.stringify(finalized, null, 2)}\n`)
  console.log(`prepare-harness-offline-store: ${digest.files} files sha256=${digest.sha256}`)
  console.log(`prepare-harness-offline-store: archive sha256=${archiveSha256}`)
  console.log(`prepare-harness-offline-store: bundle sha256=${finalized.contentSha256}`)
  return finalized
}

export function prepareHarnessOfflineStore() {
  const manifestPath = join(harnessRoot, '.bundle-manifest.json')
  const lockPath = join(harnessRoot, 'pnpm-lock.yaml')
  if (!existsSync(manifestPath) || !existsSync(lockPath)) {
    throw new Error('bundle:source must run before preparing the offline pnpm store')
  }

  runPnpm(['install', '--prod', '--frozen-lockfile', '--lockfile-only', '--ignore-scripts'])
  // Remove state from a previous fetch before creating a fresh standalone
  // store; otherwise pnpm may conclude the virtual store is already current.
  rmSync(join(harnessRoot, 'node_modules'), { recursive: true, force: true })
  rmSync(storeRoot, { recursive: true, force: true })
  runPnpm([
    'fetch', '--prod', '--frozen-lockfile', '--store-dir', '.xiaohui-pnpm-store',
    '--network-concurrency', '4', '--fetch-retries', '5', '--fetch-retry-maxtimeout', '60000',
  ])
  // `pnpm fetch` materializes a virtual store under node_modules as a working
  // directory. Runtime install must reconstruct it from the shipped store;
  // packaging this tree would duplicate bytes and preserve platform symlinks.
  rmSync(join(harnessRoot, 'node_modules'), { recursive: true, force: true })

  return packageExistingOfflineStore()
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) prepareHarnessOfflineStore()
