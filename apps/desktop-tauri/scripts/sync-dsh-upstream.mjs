/** Merge the selected official DSH Release into a reproducible XiaoHui release input. */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import semver from 'semver'

import {
  assertCurrentDshRelease,
  readDshProvenance,
  readDshUpdatePolicy,
  resolveAllowedDshRelease,
} from './dsh-release-policy.mjs'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = join(desktopRoot, '..', '..')
const productRoot = join(desktopRoot, 'product')

function runGit(args, selectedRepositoryRoot = repositoryRoot) {
  const result = spawnSync('git', args, {
    cwd: selectedRepositoryRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim()
    throw new Error(`git ${args.join(' ')} failed with exit ${result.status ?? 'unknown'}${detail ? `: ${detail}` : ''}`)
  }
  return result.stdout ?? ''
}

function gitCommitIsAncestor(commit, git) {
  try {
    git(['cat-file', '-e', `${commit}^{commit}`])
    git(['merge-base', '--is-ancestor', commit, 'HEAD'])
    return true
  }
  catch {
    return false
  }
}

function gitMergeInProgress(git) {
  try {
    git(['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'])
    return true
  }
  catch {
    return false
  }
}

function snapshotFiles(paths) {
  const records = paths.map(path => ({
    path,
    existed: existsSync(path),
    content: existsSync(path) ? readFileSync(path) : undefined,
  }))
  return {
    restore() {
      for (const record of records) {
        if (record.existed) writeFileSync(record.path, record.content)
        else rmSync(record.path, { force: true })
      }
    },
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Replace exact DSH peer versions in one package manifest.
 *
 * @param {Record<string, unknown>} manifest
 * @param {string} version
 * @returns {number}
 */
export function retargetManifestDshPeers(manifest, version) {
  const peers = manifest.peerDependencies
  if (peers === null || typeof peers !== 'object' || Array.isArray(peers)) return 0
  let changed = 0
  for (const name of Object.keys(peers)) {
    if (!name.startsWith('@deepseek-ai/dsh-') || peers[name] === version) continue
    peers[name] = version
    changed += 1
  }
  return changed
}

/**
 * Retarget approved external overrides and first-party product peers to one DSH version.
 *
 * @param {{productRoot: string, policy: ReturnType<typeof readDshUpdatePolicy>, version: string}} input
 * @returns {number}
 */
export function retargetProductDshPeers(input) {
  const pluginPolicyPath = join(input.productRoot, 'plugin-update-policy.json')
  const pluginPolicy = JSON.parse(readFileSync(pluginPolicyPath, 'utf8'))
  let changed = 0
  for (const plugin of pluginPolicy.plugins ?? []) {
    for (const overrides of Object.values(plugin.peerOverrides ?? {})) {
      for (const name of Object.keys(overrides)) {
        if (!name.startsWith('@deepseek-ai/dsh-') || overrides[name] === input.version) continue
        overrides[name] = input.version
        changed += 1
      }
    }
  }
  writeJson(pluginPolicyPath, pluginPolicy)

  for (const directory of input.policy.firstPartyPeerPackages) {
    const manifestPath = join(input.productRoot, directory, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    changed += retargetManifestDshPeers(manifest, input.version)
    writeJson(manifestPath, manifest)
  }
  return changed
}

function currentRootVersion(selectedRepositoryRoot) {
  return JSON.parse(readFileSync(join(selectedRepositoryRoot, 'package.json'), 'utf8')).version
}

function assertCleanForMerge(git) {
  const output = git(['status', '--porcelain', '--untracked-files=all']).trim()
  if (output) {
    throw new Error(`DSH refresh requires a clean worktree before an upstream merge:\n${output}`)
  }
}

function releaseState(input, release, git) {
  return {
    currentVersion: currentRootVersion(input.repositoryRoot),
    provenance: readDshProvenance(input.productRoot),
    release,
    isAncestor: gitCommitIsAncestor(release.commit, git),
  }
}

/**
 * Verify that the current checkout uses the DSH Release selected by policy.
 *
 * @param {{repositoryRoot?: string, productRoot?: string, fetchImpl?: typeof fetch, git?: (args: string[]) => string}} options
 * @returns {Promise<Awaited<ReturnType<typeof resolveAllowedDshRelease>>>}
 */
export async function checkCurrentDshRelease(options = {}) {
  const input = {
    repositoryRoot: options.repositoryRoot ?? repositoryRoot,
    productRoot: options.productRoot ?? productRoot,
  }
  const policy = readDshUpdatePolicy(input.productRoot)
  const release = await resolveAllowedDshRelease(policy, options.fetchImpl ?? globalThis.fetch)
  const git = options.git ?? (args => runGit(args, input.repositoryRoot))
  assertCurrentDshRelease(releaseState(input, release, git))
  return release
}

/**
 * Merge the selected DSH Release and retarget product peers, or report the pending update in dry-run mode.
 *
 * A successful update leaves an uncommitted merge for review. The returned rollback restores the
 * pre-merge checkout when a later release-preparation step fails.
 *
 * @param {{repositoryRoot?: string, productRoot?: string, fetchImpl?: typeof fetch, git?: (args: string[]) => string, dryRun?: boolean}} options
 * @returns {Promise<{updates: Array<{package: string, from: string, to: string, tag: string, commit: string}>, rollback: () => void}>}
 */
export async function syncDshUpstream(options = {}) {
  const input = {
    repositoryRoot: options.repositoryRoot ?? repositoryRoot,
    productRoot: options.productRoot ?? productRoot,
  }
  const policy = readDshUpdatePolicy(input.productRoot)
  const release = await resolveAllowedDshRelease(policy, options.fetchImpl ?? globalThis.fetch)
  const git = options.git ?? (args => runGit(args, input.repositoryRoot))
  const state = releaseState(input, release, git)
  if (semver.gt(state.currentVersion, release.version)) {
    assertCurrentDshRelease(state)
  }
  try {
    assertCurrentDshRelease(state)
    return { updates: [], rollback() {} }
  }
  catch {
    if (options.dryRun) {
      return {
        updates: [{
          package: '@deepseek-ai/dsh-root',
          from: state.currentVersion,
          to: release.version,
          tag: release.tag,
          commit: release.commit,
        }],
        rollback() {},
      }
    }
  }

  assertCleanForMerge(git)
  const pluginPolicyPath = join(input.productRoot, 'plugin-update-policy.json')
  const provenancePath = join(input.productRoot, 'DSH_UPSTREAM.json')
  const firstPartyPaths = policy.firstPartyPeerPackages.map(directory => (
    join(input.productRoot, directory, 'package.json')
  ))
  const snapshot = snapshotFiles([pluginPolicyPath, provenancePath, ...firstPartyPaths])
  let mergeStarted = false
  let active = true
  const rollback = () => {
    if (!active) return
    let mergeError
    if (mergeStarted && gitMergeInProgress(git)) {
      try {
        git(['merge', '--abort'])
      }
      catch (error) {
        mergeError = error
      }
    }
    snapshot.restore()
    active = false
    if (mergeError) throw mergeError
  }

  try {
    const remote = `https://github.com/${policy.repository}.git`
    git(['fetch', '--no-tags', remote, `refs/tags/${release.tag}`])
    const fetchedCommit = git(['rev-parse', 'FETCH_HEAD^{commit}']).trim()
    if (fetchedCommit !== release.commit) {
      throw new Error(`fetched DSH tag ${release.tag} resolved to ${fetchedCommit}, expected ${release.commit}`)
    }
    if (!gitCommitIsAncestor(release.commit, git)) {
      mergeStarted = true
      git(['merge', '--no-commit', '--no-ff', release.commit])
    }
    const mergedVersion = currentRootVersion(input.repositoryRoot)
    if (mergedVersion !== release.version) {
      throw new Error(`merged DSH source version is ${mergedVersion}, expected ${release.version}`)
    }
    retargetProductDshPeers({ productRoot: input.productRoot, policy, version: release.version })
    writeJson(provenancePath, {
      repository: policy.repository,
      channel: policy.channel,
      tag: release.tag,
      version: release.version,
      commit: release.commit,
    })
    return {
      updates: [{
        package: '@deepseek-ai/dsh-root',
        from: state.currentVersion,
        to: release.version,
        tag: release.tag,
        commit: release.commit,
      }],
      rollback,
    }
  }
  catch (error) {
    let rollbackError
    try {
      rollback()
    }
    catch (failure) {
      rollbackError = failure
    }
    if (rollbackError) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; DSH merge rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        { cause: error },
      )
    }
    throw error
  }
}

async function main() {
  if (process.argv.includes('--check-current')) {
    const release = await checkCurrentDshRelease()
    console.log(`sync-dsh-upstream: current DSH matches ${release.channel} Release ${release.tag} (${release.commit.slice(0, 12)})`)
    return
  }
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--check')
  const result = await syncDshUpstream({ dryRun })
  if (result.updates.length === 0) {
    console.log('sync-dsh-upstream: current DSH already matches the selected official Release')
    return
  }
  const update = result.updates[0]
  console.log(`sync-dsh-upstream: ${update.from} -> ${update.to} (${update.tag}, ${update.commit.slice(0, 12)})`)
  if (dryRun) console.log('sync-dsh-upstream: dry run did not modify the checkout')
  else console.log('sync-dsh-upstream: review and commit the prepared upstream merge')
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main().catch(error => {
    console.error(`sync-dsh-upstream: ${error.message}`)
    process.exitCode = 1
  })
}
