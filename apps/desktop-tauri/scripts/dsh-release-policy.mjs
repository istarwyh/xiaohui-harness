/** Resolve and validate the official DSH release selected for XiaoHui. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import semver from 'semver'

const requestAttempts = 3
const repositoryPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/
const packageDirectoryPattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/
const commitPattern = /^[0-9a-f]{40}$/
const supportedChannel = 'stable-else-rc'

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertOnlyFields(value, allowed, label) {
  const unknown = Object.keys(value).filter(field => !allowed.has(field))
  if (unknown.length > 0) {
    throw new Error(`${label} has unsupported field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`)
  }
}

/**
 * Validate the policy that chooses an official DSH Release.
 *
 * @param {unknown} value
 * @returns {{formatVersion: 1, repository: string, channel: 'stable-else-rc', tagPrefix: string, firstPartyPeerPackages: string[]}}
 */
export function validateDshUpdatePolicy(value) {
  if (!isPlainObject(value)) throw new Error('DSH update policy must be an object')
  assertOnlyFields(
    value,
    new Set(['formatVersion', 'repository', 'channel', 'tagPrefix', 'firstPartyPeerPackages']),
    'DSH update policy',
  )
  if (value.formatVersion !== 1) throw new Error('DSH update policy formatVersion must be 1')
  if (typeof value.repository !== 'string' || !repositoryPattern.test(value.repository)) {
    throw new Error('DSH update policy repository must be a GitHub owner/repository name')
  }
  if (value.channel !== supportedChannel) {
    throw new Error(`DSH update policy channel must be ${supportedChannel}`)
  }
  if (typeof value.tagPrefix !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.tagPrefix)) {
    throw new Error('DSH update policy tagPrefix is invalid')
  }
  if (!Array.isArray(value.firstPartyPeerPackages) || value.firstPartyPeerPackages.length === 0) {
    throw new Error('DSH update policy firstPartyPeerPackages must be a non-empty array')
  }
  const packages = value.firstPartyPeerPackages.map((directory, index) => {
    if (typeof directory !== 'string' || !packageDirectoryPattern.test(directory)) {
      throw new Error(`DSH update policy firstPartyPeerPackages[${index}] is invalid`)
    }
    return directory
  })
  if (new Set(packages).size !== packages.length) {
    throw new Error('DSH update policy firstPartyPeerPackages contains a duplicate')
  }
  return { ...value, firstPartyPeerPackages: packages }
}

/**
 * Read XiaoHui's DSH update policy.
 *
 * @param {string} productRoot
 * @returns {ReturnType<typeof validateDshUpdatePolicy>}
 */
export function readDshUpdatePolicy(productRoot) {
  return validateDshUpdatePolicy(
    JSON.parse(readFileSync(join(productRoot, 'dsh-update-policy.json'), 'utf8')),
  )
}

/**
 * Validate the immutable DSH source recorded in a XiaoHui release input.
 *
 * @param {unknown} value
 * @returns {{repository: string, channel: 'stable-else-rc', tag: string, version: string, commit: string}}
 */
export function validateDshProvenance(value) {
  if (!isPlainObject(value)) throw new Error('DSH upstream provenance must be an object')
  assertOnlyFields(value, new Set(['repository', 'channel', 'tag', 'version', 'commit']), 'DSH upstream provenance')
  if (typeof value.repository !== 'string' || !repositoryPattern.test(value.repository)) {
    throw new Error('DSH upstream provenance repository is invalid')
  }
  if (value.channel !== supportedChannel) throw new Error('DSH upstream provenance channel is invalid')
  if (typeof value.tag !== 'string' || value.tag.length === 0) throw new Error('DSH upstream provenance tag is invalid')
  if (typeof value.version !== 'string' || semver.valid(value.version) !== value.version) {
    throw new Error('DSH upstream provenance version is invalid')
  }
  if (typeof value.commit !== 'string' || !commitPattern.test(value.commit)) {
    throw new Error('DSH upstream provenance commit is invalid')
  }
  return value
}

/**
 * Read the immutable DSH source recorded for the current XiaoHui tree.
 *
 * @param {string} productRoot
 * @returns {ReturnType<typeof validateDshProvenance>}
 */
export function readDshProvenance(productRoot) {
  return validateDshProvenance(
    JSON.parse(readFileSync(join(productRoot, 'DSH_UPSTREAM.json'), 'utf8')),
  )
}

/**
 * Require committed DSH provenance to match the policy and bundled source version.
 *
 * @param {{policy: ReturnType<typeof validateDshUpdatePolicy>, provenance: ReturnType<typeof validateDshProvenance>, currentVersion: string}} input
 */
export function assertRecordedDshRelease(input) {
  if (input.provenance.repository !== input.policy.repository) {
    throw new Error(`DSH upstream repository=${input.provenance.repository} does not match ${input.policy.repository}`)
  }
  if (input.provenance.channel !== input.policy.channel) {
    throw new Error(`DSH upstream channel=${input.provenance.channel} does not match ${input.policy.channel}`)
  }
  if (input.provenance.version !== input.currentVersion) {
    throw new Error(`DSH upstream version=${input.provenance.version} does not match bundled ${input.currentVersion}`)
  }
  const expectedTag = `${input.policy.tagPrefix}${input.currentVersion}`
  if (input.provenance.tag !== expectedTag) {
    throw new Error(`DSH upstream tag=${input.provenance.tag} does not match ${expectedTag}`)
  }
}

function versionFromTag(policy, tag) {
  if (typeof tag !== 'string' || !tag.startsWith(policy.tagPrefix)) return undefined
  const version = tag.slice(policy.tagPrefix.length)
  return semver.valid(version) === version ? version : undefined
}

function releaseKind(version) {
  const prerelease = semver.prerelease(version)
  if (prerelease === null) return 'stable'
  return prerelease[0] === 'rc' ? 'rc' : undefined
}

/**
 * Select the highest stable release, falling back to the highest RC only when no stable release exists.
 *
 * @param {ReturnType<typeof validateDshUpdatePolicy>} policy
 * @param {unknown} releases
 * @returns {{tag: string, version: string, channel: 'stable' | 'rc', htmlUrl?: string}}
 */
export function selectAllowedDshRelease(policy, releases) {
  if (!Array.isArray(releases)) throw new Error('GitHub DSH Releases response must be an array')
  const candidates = releases.flatMap(release => {
    if (!isPlainObject(release) || release.draft === true) return []
    const version = versionFromTag(policy, release.tag_name)
    if (!version) return []
    const channel = releaseKind(version)
    if (!channel) return []
    if (channel === 'stable' && release.prerelease === true) return []
    return [{
      tag: release.tag_name,
      version,
      channel,
      ...(typeof release.html_url === 'string' ? { htmlUrl: release.html_url } : {}),
    }]
  })
  const stable = candidates.filter(candidate => candidate.channel === 'stable')
  const eligible = stable.length > 0 ? stable : candidates.filter(candidate => candidate.channel === 'rc')
  eligible.sort((left, right) => semver.rcompare(left.version, right.version))
  if (eligible.length === 0) {
    throw new Error(`DSH has no official stable or RC Release: ${policy.repository}`)
  }
  return eligible[0]
}

function requestHeaders(url) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'xiaohui-harness-release-preparation',
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token && new URL(url).hostname === 'api.github.com') headers.authorization = `Bearer ${token}`
  return headers
}

async function pause(milliseconds) {
  await new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds))
}

async function requestJson(url, fetchImpl) {
  let lastError
  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: requestHeaders(url),
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return await response.json()
    }
    catch (error) {
      lastError = error
      if (attempt < requestAttempts) await pause(250 * attempt)
    }
  }
  throw new Error(`DSH release request failed after ${requestAttempts} attempts: ${url}: ${lastError?.message ?? lastError}`)
}

async function resolveTagCommit(repository, tag, fetchImpl) {
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
  if (object?.type !== 'commit' || !commitPattern.test(object.sha ?? '')) {
    throw new Error(`DSH Release tag does not resolve to a commit: ${repository}@${tag}`)
  }
  return object.sha
}

/**
 * Resolve the current official DSH Release allowed by XiaoHui's channel policy.
 *
 * @param {ReturnType<typeof validateDshUpdatePolicy>} policy
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<ReturnType<typeof selectAllowedDshRelease> & {commit: string}>}
 */
export async function resolveAllowedDshRelease(policy, fetchImpl = globalThis.fetch) {
  const releases = []
  for (let page = 1; page <= 10; page += 1) {
    const suffix = page === 1 ? '' : `&page=${page}`
    const batch = await requestJson(
      `https://api.github.com/repos/${policy.repository}/releases?per_page=100${suffix}`,
      fetchImpl,
    )
    if (!Array.isArray(batch)) throw new Error('GitHub DSH Releases response must be an array')
    releases.push(...batch)
    if (batch.length < 100) break
    if (page === 10) throw new Error('DSH Release history exceeds the 1000-entry resolution limit')
  }
  const selected = selectAllowedDshRelease(policy, releases)
  const commit = await resolveTagCommit(policy.repository, selected.tag, fetchImpl)
  return { ...selected, repository: policy.repository, commit }
}

/**
 * Require the checked-out DSH source and provenance to match the selected official Release.
 *
 * @param {{currentVersion: string, provenance: ReturnType<typeof validateDshProvenance>, release: Awaited<ReturnType<typeof resolveAllowedDshRelease>>, isAncestor: boolean}} state
 */
export function assertCurrentDshRelease(state) {
  const { currentVersion, provenance, release, isAncestor } = state
  if (semver.valid(currentVersion) !== currentVersion) {
    throw new Error(`current DSH version is invalid: ${currentVersion}`)
  }
  if (semver.gt(currentVersion, release.version)) {
    throw new Error(`DSH policy selected ${release.version}, which would downgrade current ${currentVersion}`)
  }
  if (currentVersion !== release.version) {
    throw new Error(`current DSH ${currentVersion} is not the selected ${release.channel} Release ${release.version}`)
  }
  for (const field of ['repository', 'tag', 'version', 'commit']) {
    if (provenance[field] !== release[field]) {
      throw new Error(`DSH upstream provenance ${field}=${provenance[field]} does not match ${release[field]}`)
    }
  }
  if (provenance.channel !== supportedChannel) {
    throw new Error(`DSH upstream provenance channel=${provenance.channel} does not match ${supportedChannel}`)
  }
  if (!isAncestor) {
    throw new Error(`official DSH commit ${release.commit} is not an ancestor of the XiaoHui release input`)
  }
}
