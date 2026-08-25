export const NPM_PACKAGE_NAME = 'dsh-harbor-evolution'
export const NPM_LATEST_URL = `https://registry.npmjs.org/${NPM_PACKAGE_NAME}/latest`
export const RELEASES_URL = 'https://github.com/istarwyh/harbor-self-evolving/releases'

const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1_000
const DEFAULT_FAILURE_TTL_MS = 5 * 60 * 1_000
const DEFAULT_TIMEOUT_MS = 2_500

export function parseSemver(value) {
  const match = String(value ?? '').match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

function compareIdentifier(left, right) {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : undefined
  const rightNumber = /^\d+$/.test(right) ? Number(right) : undefined
  if (leftNumber !== undefined && rightNumber !== undefined) return Math.sign(leftNumber - rightNumber)
  if (leftNumber !== undefined) return -1
  if (rightNumber !== undefined) return 1
  return left.localeCompare(right)
}

export function compareSemver(leftValue, rightValue) {
  const left = parseSemver(leftValue)
  const right = parseSemver(rightValue)
  if (!left || !right) return undefined
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return Math.sign(left[key] - right[key])
  }
  if (!left.prerelease.length && !right.prerelease.length) return 0
  if (!left.prerelease.length) return 1
  if (!right.prerelease.length) return -1
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    if (left.prerelease[index] === undefined) return -1
    if (right.prerelease[index] === undefined) return 1
    const comparison = compareIdentifier(left.prerelease[index], right.prerelease[index])
    if (comparison) return Math.sign(comparison)
  }
  return 0
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`
}

export function renderUpdateCommand(latestVersion, projectRoot) {
  if (!parseSemver(latestVersion)) throw new Error('latestVersion must be a valid semantic version')
  return `npx --yes ${NPM_PACKAGE_NAME}@${latestVersion} setup --project-root ${shellQuote(projectRoot)}`
}

function buildResult(currentVersion, latestVersion, projectRoot, checkedAt, options = {}) {
  const comparison = compareSemver(currentVersion, latestVersion)
  if (comparison === undefined) {
    return { status: 'unavailable', currentVersion, checkedAt, source: options.source, stale: options.stale }
  }
  const updateAvailable = comparison < 0
  return {
    status: updateAvailable ? 'update-available' : 'up-to-date',
    currentVersion,
    latestVersion,
    checkedAt,
    source: options.source,
    stale: options.stale,
    releaseUrl: updateAvailable ? `${RELEASES_URL}/tag/v${latestVersion}` : RELEASES_URL,
    command: updateAvailable ? renderUpdateCommand(latestVersion, projectRoot) : undefined,
  }
}

export function createVersionChecker(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const now = options.now ?? Date.now
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const failureTtlMs = options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let successful
  let failedAt = 0

  return async function checkVersion({ currentVersion, projectRoot, refresh = false }) {
    const checkedAt = new Date(now()).toISOString()
    if (!refresh && successful && now() < successful.expiresAt) {
      return buildResult(currentVersion, successful.latestVersion, projectRoot, successful.checkedAt, { source: 'cache' })
    }
    if (!refresh && !successful && failedAt && now() - failedAt < failureTtlMs) {
      return { status: 'unavailable', currentVersion, checkedAt, source: 'cache' }
    }
    if (typeof fetchImpl !== 'function') {
      failedAt = now()
      return { status: 'unavailable', currentVersion, checkedAt, source: 'host' }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(NPM_LATEST_URL, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('registry request failed')
      const manifest = await response.json()
      if (manifest?.name !== NPM_PACKAGE_NAME || !parseSemver(manifest.version)) {
        throw new Error('registry response is invalid')
      }
      successful = {
        latestVersion: manifest.version,
        checkedAt,
        expiresAt: now() + cacheTtlMs,
      }
      failedAt = 0
      return buildResult(currentVersion, successful.latestVersion, projectRoot, checkedAt, { source: 'registry' })
    } catch {
      failedAt = now()
      if (successful) {
        return buildResult(currentVersion, successful.latestVersion, projectRoot, successful.checkedAt, { source: 'cache', stale: true })
      }
      return { status: 'unavailable', currentVersion, checkedAt, source: 'registry' }
    } finally {
      clearTimeout(timeout)
    }
  }
}
