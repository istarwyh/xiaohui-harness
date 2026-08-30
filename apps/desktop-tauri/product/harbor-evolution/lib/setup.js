import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { runProcess } from './process.js'
import { DSH_RUNTIME_VERSION } from './runtime-identity.js'

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)

export const INTEGRATION_VERSION = packageJson.version
export const DSH_VERSION = DSH_RUNTIME_VERSION

function requireValue(args, index, flag) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

export function parseSetupArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--help' || flag === '-h') {
      options.help = true
      continue
    }
    if (flag === '--profile') options.profile = requireValue(args, index++, flag)
    else if (flag === '--project-root') options.projectRoot = requireValue(args, index++, flag)
    else if (flag === '--jobs-dir') options.jobsDir = requireValue(args, index++, flag)
    else if (flag === '--dsh-home') options.dshHome = requireValue(args, index++, flag)
    else if (flag === '--runtime-dir') options.runtimeDir = requireValue(args, index++, flag)
    else if (flag === '--plugin-spec') options.pluginSpec = requireValue(args, index++, flag)
    else if (flag === '--python-spec') options.pythonSpec = requireValue(args, index++, flag)
    else throw new Error(`Unknown setup option: ${flag}`)
  }
  return options
}

function executableInVenv(venvDir, name, platform) {
  return platform === 'win32'
    ? path.join(venvDir, 'Scripts', `${name}.exe`)
    : path.join(venvDir, 'bin', name)
}

function assertSafeProfile(profile) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile)) {
    throw new Error('profile may contain only letters, numbers, dot, underscore, and hyphen')
  }
}

function assertJobsDir(projectRoot, jobsDir) {
  if (!jobsDir) throw new Error('jobsDir cannot be empty')
  const root = path.resolve(projectRoot)
  const resolved = path.resolve(root, jobsDir)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('jobsDir must stay under projectRoot')
  }
}

export function resolveSetupOptions(raw = {}, environment = {}) {
  const env = environment.env ?? process.env
  const cwd = environment.cwd ?? process.cwd()
  const home = environment.home ?? os.homedir()
  const platform = environment.platform ?? process.platform
  const profile = raw.profile ?? 'web'
  const projectRoot = path.resolve(cwd, raw.projectRoot ?? '.')
  const dataHome = env.XDG_DATA_HOME
    ? path.resolve(env.XDG_DATA_HOME)
    : path.join(home, '.local', 'share')
  const dshHome = path.resolve(raw.dshHome ?? env.DSH_HOME ?? path.join(home, '.dsh'))
  const runtimeDir = path.resolve(raw.runtimeDir ?? path.join(dataHome, 'harbor-dsh-evolution'))
  const jobsDir = raw.jobsDir ?? 'jobs'
  const venvDir = path.join(runtimeDir, '.venv')

  assertSafeProfile(profile)
  assertJobsDir(projectRoot, jobsDir)

  return {
    profile,
    projectRoot,
    jobsDir,
    dshHome,
    runtimeDir,
    venvDir,
    pythonBin: executableInVenv(venvDir, 'python', platform),
    harborBin: executableInVenv(venvDir, 'harbor', platform),
    harborDshBin: executableInVenv(venvDir, 'harbor-dsh', platform),
    patchFile: path.join(dshHome, 'profiles', profile, 'cordis.patch.yml'),
    pluginSpec: raw.pluginSpec ?? `dsh-harbor-evolution@${INTEGRATION_VERSION}`,
    pythonSpec: raw.pythonSpec ?? `harbor-dsh-evolution==${INTEGRATION_VERSION}`,
  }
}

export async function resolveLocalPluginDirectory(pluginSpec, cwd = process.cwd()) {
  let candidate
  if (pluginSpec.startsWith('file://')) candidate = fileURLToPath(pluginSpec)
  else if (pluginSpec.startsWith('file:')) candidate = path.resolve(cwd, pluginSpec.slice(5))
  else if (!pluginSpec.startsWith('github:') && !pluginSpec.startsWith('git+')) {
    candidate = path.resolve(cwd, pluginSpec)
  }
  if (!candidate) return undefined

  try {
    const details = await stat(candidate)
    if (!details.isDirectory()) return undefined
    const manifest = JSON.parse(await readFile(path.join(candidate, 'package.json'), 'utf8'))
    return manifest.name === 'dsh-harbor-evolution' ? candidate : undefined
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return undefined
    throw error
  }
}

function quoted(value) {
  return JSON.stringify(value)
}

export function renderHarborProfileEntry(config) {
  return [
    '- id: harbor-evolution',
    '  config:',
    `    projectRoot: ${quoted(config.projectRoot)}`,
    `    jobsDir: ${quoted(config.jobsDir)}`,
    `    harborBin: ${quoted(config.harborBin)}`,
    `    harborDshBin: ${quoted(config.harborDshBin)}`,
    '    pythonPath: ""',
  ].join('\n')
}

export function upsertHarborProfileEntry(source, config) {
  const entry = renderHarborProfileEntry(config)
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const starts = []
  for (let index = 0; index < lines.length; index += 1) {
    if (/^- id:\s*["']?harbor-evolution["']?\s*$/.test(lines[index])) starts.push(index)
  }
  if (starts.length > 1) {
    throw new Error('cordis.patch.yml contains multiple harbor-evolution entries; remove duplicates first')
  }

  if (starts.length === 1) {
    const start = starts[0]
    let end = lines.length
    for (let index = start + 1; index < lines.length; index += 1) {
      if (/^- \S/.test(lines[index])) {
        end = index
        break
      }
    }
    lines.splice(start, end - start, ...entry.split('\n'))
    return `${lines.join('\n').replace(/\n+$/g, '')}\n`
  }

  const emptyArrayIndex = lines.findIndex(line => line.trim() === '[]')
  const payload = lines.filter(line => line.trim() && !line.trim().startsWith('#'))
  if (emptyArrayIndex >= 0 && payload.length === 1) {
    lines.splice(emptyArrayIndex, 1, ...entry.split('\n'))
    return `${lines.join('\n').replace(/\n+$/g, '')}\n`
  }

  const current = lines.join('\n').replace(/\n+$/g, '')
  return `${current ? `${current}\n` : ''}${entry}\n`
}

async function writeProfilePatch(file, config) {
  let source
  try {
    source = await readFile(file, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    source = [
      '# Harbor Self-Evolving profile overrides.',
      '# This file is applied after the DSH bundle layers.',
      '[]',
      '',
    ].join('\n')
  }
  const updated = upsertHarborProfileEntry(source, config)
  if (updated === source) return false

  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, updated, 'utf8')
  await rename(temporary, file)
  return true
}

async function assertDirectory(directory) {
  let details
  try {
    details = await stat(directory)
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`projectRoot does not exist: ${directory}`)
    throw error
  }
  if (!details.isDirectory()) throw new Error(`projectRoot is not a directory: ${directory}`)
}

async function requireCommand(run, command) {
  try {
    return await run(command, ['--version'], { timeoutMs: 10_000 })
  } catch (error) {
    if (error.code === 'ENOENT' || error.cause?.code === 'ENOENT') {
      throw new Error(`Missing ${command}; install it before running setup`)
    }
    throw error
  }
}

function processFailure(error) {
  const detail = error.result?.stderr?.trim() || error.result?.stdout?.trim()
  return detail ? `${error.message}\n${detail}` : error.message
}

export async function setupIntegration(raw = {}, dependencies = {}) {
  const config = resolveSetupOptions(raw, dependencies)
  const run = dependencies.run ?? runProcess
  const progress = dependencies.onProgress ?? (() => {})
  const env = dependencies.env ?? process.env
  const warnings = []

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10)
  if (nodeMajor < 22) throw new Error(`Node.js 22 or newer is required; found ${process.version}`)
  await assertDirectory(config.projectRoot)

  progress('1/4 Checking uv, pnpm, and Docker...')
  await requireCommand(run, 'uv')
  await requireCommand(run, 'pnpm')
  try {
    await run('docker', ['info'], { timeoutMs: 15_000 })
  } catch (error) {
    warnings.push(`Docker is not ready; installation can finish, but Harbor Jobs will fail until it is available. ${processFailure(error)}`)
  }

  const localPluginDir = await resolveLocalPluginDirectory(
    config.pluginSpec,
    dependencies.cwd ?? process.cwd(),
  )
  if (localPluginDir) {
    progress('Preparing dependencies for the linked DSH plugin checkout...')
    await requireCommand(run, 'npm')
    // Node resolves a symlinked package from its real checkout path. Install
    // the complete locked graph there so runtime dependencies and host peers
    // do not disappear behind the profile's `link:` entry.
    await run('npm', ['ci', '--ignore-scripts'], { cwd: localPluginDir })
    // The browser half is generated from source and embeds its visual asset.
    // Build explicitly because the locked install above intentionally skips
    // lifecycle scripts for deterministic source-checkout setup.
    await run('npm', ['run', 'build'], { cwd: localPluginDir })
  }

  progress('2/4 Installing the Harbor Python runtime...')
  await mkdir(config.runtimeDir, { recursive: true })
  await run('uv', ['venv', '--python', '3.12', '--allow-existing', config.venvDir])
  await run('uv', [
    'pip', 'install',
    '--python', config.pythonBin,
    '--refresh-package', 'harbor-dsh-evolution',
    config.pythonSpec,
  ])

  progress(`3/4 Installing the DSH bundle into profile ${config.profile}...`)
  try {
    await run('pnpm', [
      '--silent', 'dlx', `@deepseek-ai/dsh@${DSH_VERSION}`,
      // Registry packages ship their built client and need no lifecycle
      // scripts. Skipping scripts also prevents pnpm 11 from reclassifying
      // unrelated DSH native dependencies as newly unapproved builds while
      // adding this plugin to an existing profile.
      'plugin', '--profile', config.profile, 'add', '-w', '--save-exact', '--ignore-scripts', config.pluginSpec,
    ], { env: { ...env, DSH_HOME: config.dshHome } })
  } catch (error) {
    throw new Error(processFailure(error))
  }

  progress('4/4 Saving paths and verifying the integration...')
  const patchChanged = await writeProfilePatch(config.patchFile, config)
  const harborVersion = await run(config.harborBin, ['--version'], { timeoutMs: 10_000 })
  const plugins = await run(config.harborBin, ['plugins', 'list'], { timeoutMs: 10_000 })
  verifyHarborPlugins(plugins.stdout)
  await run(config.harborDshBin, ['--help'], { timeoutMs: 10_000 })

  return {
    ...config,
    localPluginDir,
    patchChanged,
    harborVersion: harborVersion.stdout.trim() || harborVersion.stderr.trim(),
    warnings,
  }
}

export function verifyHarborPlugins(output) {
  const missing = ['dsh-evolution', 'dsh-historical-evaluation']
    .filter(name => !String(output).includes(name))
  if (missing.length) {
    throw new Error(`Harbor installed, but these plugin entry points were not discovered: ${missing.join(', ')}`)
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`
}

export function renderSetupResult(result) {
  const startCommand = result.profile === 'web'
    ? `DSH_HOME=${shellQuote(result.dshHome)} pnpm dlx @deepseek-ai/dsh@${DSH_VERSION} web`
    : `DSH_HOME=${shellQuote(result.dshHome)} pnpm dlx @deepseek-ai/dsh@${DSH_VERSION} --profile ${shellQuote(result.profile)}`
  const lines = [
    '',
    `Installed Harbor Self-Evolving ${INTEGRATION_VERSION}.`,
    `DSH profile: ${result.profile}`,
    `Project root: ${result.projectRoot}`,
    `Profile config: ${result.patchFile}`,
    `Harbor: ${result.harborVersion}`,
  ]
  for (const warning of result.warnings) lines.push(`Warning: ${warning}`)
  lines.push(
    '',
    'Restart DSH from the Agent workspace:',
    `cd ${shellQuote(result.projectRoot)}`,
    startCommand,
    '',
    result.profile === 'web'
      ? 'Open the Harbor tab, or invoke: /evolve-agent-with-harbor'
      : 'Then invoke: /evolve-agent-with-harbor',
  )
  return lines.join('\n')
}
