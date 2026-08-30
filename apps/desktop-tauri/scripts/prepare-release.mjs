/** Refresh, lock, bundle, and smoke-test a reproducible local XiaoHui release input. */
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { assertBundledProductPeerLinks } from './product-plugin-compatibility.mjs'
import { removeWorkspaceInstallState } from './prepare-harness-offline-store.mjs'
import { readProductUpdatePolicy, refreshProductPlugins } from './refresh-product-plugins.mjs'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = join(desktopRoot, '..', '..')
const productRoot = join(desktopRoot, 'product')
const bundleRoot = join(desktopRoot, 'bundled', 'harness')
const credentialVariablePattern = /API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_?KEY|CREDENTIAL|AUTH|COOKIE|BEARER|JWT|SIGNING/iu
const credentialAccessVariables = new Set([
  'AWS_CONFIG_FILE',
  'AWS_DEFAULT_PROFILE',
  'AWS_PROFILE',
  'DOCKER_CONFIG',
  'GH_CONFIG_DIR',
  'GIT_ASKPASS',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'KUBECONFIG',
  'NETRC',
  'NPM_CONFIG_GLOBALCONFIG',
  'NPM_CONFIG_USERCONFIG',
  'PIP_CONFIG_FILE',
  'PIP_EXTRA_INDEX_URL',
  'PIP_INDEX_URL',
  'SSH_ASKPASS',
  'SSH_AUTH_SOCK',
  'UV_CONFIG_FILE',
  'UV_EXTRA_INDEX_URL',
  'UV_INDEX_URL',
])
const processInjectionVariables = new Set([
  '_JAVA_OPTIONS',
  'BASH_ENV',
  'BASHOPTS',
  'CLASSPATH',
  'DOTNET_ADDITIONAL_DEPS',
  'DOTNET_SHARED_STORE',
  'DOTNET_STARTUP_HOOKS',
  'ELECTRON_RUN_AS_NODE',
  'ENV',
  'GIT_CONFIG_PARAMETERS',
  'GIT_EXTERNAL_DIFF',
  'GIT_PROXY_COMMAND',
  'GIT_SSH_COMMAND',
  'JDK_JAVA_OPTIONS',
  'JAVA_TOOL_OPTIONS',
  'LD_AUDIT',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NPM_CONFIG_NODE_OPTIONS',
  'NPM_CONFIG_SCRIPT_SHELL',
  'PERL5LIB',
  'PERL5OPT',
  'PYTHONBREAKPOINT',
  'PYTHONHOME',
  'PYTHONINSPECT',
  'PYTHONPATH',
  'PYTHONSTARTUP',
  'PYTHONWARNINGS',
  'RUBYLIB',
  'RUBYOPT',
  'RUSTC_WORKSPACE_WRAPPER',
  'RUSTC_WRAPPER',
  'RUSTFLAGS',
  'SHELLOPTS',
  'ZDOTDIR',
])
const processInjectionPrefixes = [
  'DYLD_',
  '__XPC_DYLD_',
  'GIT_CONFIG_KEY_',
  'GIT_CONFIG_VALUE_',
]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status ?? 'unknown'}`)
  }
}

function runNode(script, env = process.env) {
  run(process.execPath, [join(desktopRoot, 'scripts', script)], { cwd: desktopRoot, env })
}

function runPnpm(cwd, args, env = process.env) {
  const npmExecPath = process.env.npm_execpath
  if (npmExecPath && /\.[cm]?js$/i.test(npmExecPath)) {
    run(process.execPath, [npmExecPath, ...args], { cwd, env })
  }
  else {
    run('pnpm', args, { cwd, env })
  }
}

function managedProductPaths(policy) {
  return [
    ...policy.plugins.flatMap(plugin => [
      join(productRoot, plugin.destination),
      ...(plugin.pythonDestination ? [join(productRoot, plugin.pythonDestination)] : []),
    ]),
    join(productRoot, 'harness-pnpm-lock.yaml'),
  ]
}

function snapshotManagedProduct(policy) {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-release-rollback-'))
  let records
  try {
    records = managedProductPaths(policy).map((path, index) => {
      const backup = join(root, String(index))
      const existed = existsSync(path)
      if (existed) cpSync(path, backup, { recursive: true })
      return { path, backup, existed }
    })
  }
  catch (error) {
    throw recoverReleaseFailure(error, [
      { label: 'partial rollback snapshot cleanup', run: () => rmSync(root, { recursive: true, force: true }) },
    ])
  }
  return {
    discard() {
      rmSync(root, { recursive: true, force: true })
    },
    restore() {
      const failures = []
      for (const record of [...records].reverse()) {
        try {
          rmSync(record.path, { recursive: true, force: true })
          if (record.existed) {
            mkdirSync(dirname(record.path), { recursive: true })
            cpSync(record.backup, record.path, { recursive: true })
          }
        }
        catch (error) {
          failures.push(`${record.path}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      if (failures.length > 0) throw new Error(failures.join('; '))
    },
  }
}

/**
 * Remove environment variables that directly carry or unlock credentials.
 *
 * @param {NodeJS.ProcessEnv} source
 * @returns {NodeJS.ProcessEnv}
 */
export function releaseCandidateEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name, value]) => (
    value !== undefined && !isRejectedEnvironmentVariable(name)
  )))
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isRejectedEnvironmentVariable(name) {
  const canonical = name.toUpperCase()
  return credentialVariablePattern.test(canonical)
    || credentialAccessVariables.has(canonical)
    || processInjectionVariables.has(canonical)
    || processInjectionPrefixes.some(prefix => canonical.startsWith(prefix))
}

/**
 * Reproduce the tagged workflow's XiaoHui Client branding without ambient overrides.
 *
 * @param {NodeJS.ProcessEnv} source
 * @returns {NodeJS.ProcessEnv}
 */
export function releaseBuildEnvironment(source = process.env) {
  const env = releaseCandidateEnvironment(source)
  for (const name of Object.keys(env)) {
    if (name.startsWith('DSH_CLIENT_')) delete env[name]
  }
  env.DSH_CLIENT_TITLE = 'XiaoHui Harness'
  return env
}

/**
 * Keep GitHub authentication in API requests instead of candidate subprocess environments.
 *
 * @param {NodeJS.ProcessEnv} source
 * @param {typeof fetch} fetchImpl
 * @returns {typeof fetch}
 */
export function releaseFetch(source = process.env, fetchImpl = globalThis.fetch) {
  let githubToken = source.GITHUB_TOKEN || source.GH_TOKEN
  if (!githubToken) {
    const result = spawnSync('gh', ['auth', 'token', '--hostname', 'github.com'], {
      encoding: 'utf8',
      env: source,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    if (result.status === 0) githubToken = result.stdout.trim()
  }
  return (url, options = {}) => {
    const parsed = new URL(url)
    if (!githubToken || parsed.hostname !== 'api.github.com') return fetchImpl(url, options)
    const headers = new Headers(options.headers)
    headers.set('authorization', `Bearer ${githubToken}`)
    return fetchImpl(url, { ...options, headers })
  }
}

/**
 * Create private homes and caches for build, packaging, and compatibility execution.
 *
 * @param {NodeJS.ProcessEnv} source
 * @param {string} [temporaryRoot]
 * @returns {{env: NodeJS.ProcessEnv, root: string, discard: () => void}}
 */
export function isolatedReleaseEnvironment(source = process.env, temporaryRoot = tmpdir()) {
  const root = mkdtempSync(join(temporaryRoot, 'xiaohui-release-environment-'))
  try {
    const env = releaseBuildEnvironment(source)
    for (const name of Object.keys(env)) {
      if (name.startsWith('DSH_')) delete env[name]
    }
    const paths = {
      HOME: join(root, 'home'),
      XDG_CONFIG_HOME: join(root, 'xdg-config'),
      XDG_CACHE_HOME: join(root, 'xdg-cache'),
      XDG_DATA_HOME: join(root, 'xdg-data'),
      XDG_STATE_HOME: join(root, 'xdg-state'),
      DSH_HOME: join(root, 'dsh-home'),
      DSH_AGENTS_HOME: join(root, 'agents-home'),
      TMPDIR: join(root, 'tmp'),
      UV_CACHE_DIR: join(root, 'uv-cache'),
      PIP_CACHE_DIR: join(root, 'pip-cache'),
      npm_config_cache: join(root, 'npm-cache'),
    }
    for (const path of Object.values(paths)) mkdirSync(path, { recursive: true })
    Object.assign(env, paths, {
      DSH_CLIENT_TITLE: 'XiaoHui Harness',
      TMP: paths.TMPDIR,
      TEMP: paths.TMPDIR,
    })
    return {
      env,
      root,
      discard() {
        rmSync(root, { recursive: true, force: true })
      },
    }
  }
  catch (error) {
    throw recoverReleaseFailure(error, [
      { label: 'partial isolated environment cleanup', run: () => rmSync(root, { recursive: true, force: true }) },
    ])
  }
}

/**
 * Run an asynchronous operation with exactly the supplied process environment.
 *
 * @template T
 * @param {NodeJS.ProcessEnv} environment
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
export async function withProcessEnvironment(environment, operation) {
  const previous = { ...process.env }
  let result
  let operationError
  try {
    for (const name of Object.keys(process.env)) delete process.env[name]
    Object.assign(process.env, environment)
    result = await operation()
  }
  catch (error) {
    operationError = error
  }
  let restorationError
  try {
    for (const name of Object.keys(process.env)) delete process.env[name]
    Object.assign(process.env, previous)
  }
  catch (error) {
    restorationError = error
  }
  if (operationError) {
    if (restorationError) {
      const primary = operationError instanceof Error ? operationError : new Error(String(operationError))
      throw new Error(
        `${primary.message}; process environment restoration also failed: ${restorationError instanceof Error ? restorationError.message : String(restorationError)}`,
        { cause: primary },
      )
    }
    throw operationError
  }
  if (restorationError) throw restorationError
  return result
}

/**
 * Run every recovery action while retaining the release failure as the cause.
 *
 * @param {unknown} primaryError
 * @param {Array<{label: string, run: () => void}>} recovery
 * @returns {Error}
 */
export function recoverReleaseFailure(primaryError, recovery) {
  const primary = primaryError instanceof Error ? primaryError : new Error(String(primaryError))
  const failures = []
  for (const step of recovery) {
    try {
      step.run()
    }
    catch (error) {
      failures.push(`${step.label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const recoveryStatus = failures.length === 0
    ? '; all recovery steps completed'
    : `; recovery also failed: ${failures.join('; ')}`
  return new Error(`local release preparation failed: ${primary.message}${recoveryStatus}`, { cause: primary })
}

/**
 * Describe what a dry run proved and explicitly name the omitted dynamic gates.
 *
 * @param {unknown[]} updates
 * @returns {string}
 */
export function formatDryRunSummary(updates) {
  return `prepare-release: dry run found ${updates.length} latest candidate update${updates.length === 1 ? '' : 's'}; static candidate checks passed; build, frozen install, and Host smoke were not run`
}

function regenerateProductLock(env) {
  runNode('bundle-harness-source.mjs', env)
  runPnpm(bundleRoot, [
    'install', '--prod', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts',
  ], { ...env, CI: 'true' })
  copyFileSync(join(bundleRoot, 'pnpm-lock.yaml'), join(productRoot, 'harness-pnpm-lock.yaml'))
  runNode('bundle-harness-source.mjs', env)
  const checked = assertBundledProductPeerLinks(bundleRoot)
  console.log(`prepare-release: frozen lockfile keeps ${checked} product runtime peers in the bundled workspace`)
}

/**
 * Prepare committed inputs for a later reproducible tagged XiaoHui build.
 * A dry run resolves latest candidates and runs static checks only.
 *
 * @param {{allowDirty?: boolean, dryRun?: boolean}} options
 * @returns {Promise<{scope: 'latest-candidate-static-checks' | 'prepared-release-inputs', updates: unknown[]}>}
 */
export async function prepareRelease(options = {}) {
  const policy = readProductUpdatePolicy(productRoot)
  const sourceEnvironment = { ...process.env }
  const fetchImpl = releaseFetch(sourceEnvironment)
  if (options.dryRun) {
    const candidateEnvironment = releaseBuildEnvironment(sourceEnvironment)
    const updates = await withProcessEnvironment(candidateEnvironment, () => refreshProductPlugins({
      allowDirty: options.allowDirty,
      dryRun: true,
      fetchImpl,
    }))
    return { scope: 'latest-candidate-static-checks', updates }
  }

  const rollback = snapshotManagedProduct(policy)
  let isolated
  try {
    isolated = isolatedReleaseEnvironment(sourceEnvironment)
  }
  catch (error) {
    throw recoverReleaseFailure(error, [
      { label: 'rollback snapshot cleanup', run: () => rollback.discard() },
    ])
  }
  let updates
  let failure
  try {
    // Load trusted verification tooling before HOME is isolated so Playwright binds to
    // the browser installed with the developer workspace, not an empty temporary cache.
    const { verifyPreparedProduct } = await import('./verify-product-release.mjs')
    updates = await withProcessEnvironment(isolated.env, async () => {
      const refreshed = await refreshProductPlugins({
        allowDirty: options.allowDirty,
        fetchImpl,
      })
      runPnpm(repositoryRoot, ['run', 'build'], isolated.env)
      regenerateProductLock(isolated.env)
      runNode('prepare-dist.mjs', {
        ...isolated.env,
        XIAOHUI_KEEP_PREPARED_HARNESS_INSTALL: '1',
        XIAOHUI_OFFLINE_STORE_CACHE_DIR: '',
      })
      await verifyPreparedProduct()
      return refreshed
    })
  }
  catch (error) {
    failure = error
  }
  finally {
    if (failure) {
      failure = recoverReleaseFailure(failure, [
        { label: 'product rollback', run: () => rollback.restore() },
        { label: 'temporary node_modules cleanup', run: () => removeWorkspaceInstallState(bundleRoot) },
        { label: 'isolated release environment cleanup', run: () => isolated.discard() },
        { label: 'rollback snapshot cleanup', run: () => rollback.discard() },
      ])
    }
    else {
      const cleanupFailures = []
      for (const step of [
        { label: 'isolated release environment cleanup', run: () => isolated.discard() },
        { label: 'rollback snapshot cleanup', run: () => rollback.discard() },
      ]) {
        try {
          step.run()
        }
        catch (error) {
          cleanupFailures.push(`${step.label}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      if (cleanupFailures.length > 0) {
        failure = new Error(`local release inputs were prepared, but temporary cleanup failed: ${cleanupFailures.join('; ')}`)
      }
    }
  }
  if (failure) throw failure
  console.log('prepare-release: compatible product sources and frozen lockfile are ready for review and commit')
  return { scope: 'prepared-release-inputs', updates }
}

async function main() {
  const allowDirty = process.argv.includes('--allow-dirty')
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--check')
  const result = await prepareRelease({ allowDirty, dryRun })
  if (dryRun) {
    console.log(formatDryRunSummary(result.updates))
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  main().catch(error => {
    console.error(`prepare-release: ${error.message}`)
    process.exitCode = 1
  })
}
