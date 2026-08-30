/** Verify the prepared XiaoHui product graph through its installed runtime and Web Host. */
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

import {
  assertBundledProductPeerLinks,
  isBundledRuntimePackage,
  readWorkspacePackageVersions,
} from './product-plugin-compatibility.mjs'
import { removeWorkspaceInstallState } from './prepare-harness-offline-store.mjs'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const harnessRoot = join(desktopRoot, 'bundled', 'harness')
const runtimeRoot = join(desktopRoot, 'bundled', 'xiaohui-runtime')
const installedChromiumExecutable = chromium.executablePath()
const desktopShellSource = readFileSync(join(desktopRoot, 'shell.html'), 'utf8')
const desktopI18nSource = readFileSync(join(desktopRoot, 'desktop-i18n.js'), 'utf8')
const desktopAppIcon = readFileSync(join(desktopRoot, 'app-icon.png'))
const desktopUpdateSmokeResult = 'Development build smoke does not check desktop updates'

/** Product Client packages that must execute during the assembled Web smoke. */
export const PRODUCT_CLIENT_IDS = [
  'dsh-codex-auth',
  'dsh-better-sidebar',
  'dsh-context-doctor',
  'dsh-personal-workbench',
  'dsh-harbor-evolution',
]

/**
 * Build the isolated environment used to execute unreviewed release candidates.
 *
 * @param {string} root
 * @param {string} productRuntimeRoot
 * @param {NodeJS.ProcessEnv} parentEnvironment
 * @returns {NodeJS.ProcessEnv}
 */
export function createReleaseChildEnvironment(
  root,
  productRuntimeRoot,
  parentEnvironment = process.env,
) {
  const home = join(root, 'home')
  const temporary = join(root, 'tmp')
  const directories = {
    HOME: home,
    USERPROFILE: home,
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
    APPDATA: join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(home, 'AppData', 'Local'),
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    UV_CACHE_DIR: join(root, 'uv-cache'),
    DSH_HOME: join(root, 'dsh-home'),
    DSH_AGENTS_HOME: join(root, 'agents'),
  }
  for (const directory of new Set(Object.values(directories))) mkdirSync(directory, { recursive: true })

  const inherited = {}
  for (const name of ['LANG', 'LC_ALL', 'LC_CTYPE', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) {
    if (parentEnvironment[name] !== undefined) inherited[name] = parentEnvironment[name]
  }
  const runtimeBin = join(productRuntimeRoot, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin')
  const systemPath = process.platform === 'win32'
    ? [
        dirname(process.execPath),
        runtimeBin,
        ...(parentEnvironment.SystemRoot ? [join(parentEnvironment.SystemRoot, 'System32')] : []),
      ]
    : [dirname(process.execPath), runtimeBin, '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  return {
    ...inherited,
    ...directories,
    PATH: [...new Set(systemPath)].join(delimiter),
    DEEPSEEK_API_KEY: 'xiaohui-release-smoke-no-model-call',
    PYTHONUTF8: '1',
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit ${result.status ?? 'unknown'}\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    )
  }
  return result.stdout ?? ''
}

/**
 * Prove installed product peers point at the same workspace packages as the Host.
 *
 * @param {string} root
 * @returns {number}
 */
export function assertInstalledProductPeerLinks(root) {
  const workspace = readWorkspacePackageVersions(root)
  const productRoot = join(root, 'packages', 'product')
  let checked = 0
  for (const plugin of ['harbor-evolution', 'dsh-codex-auth', 'dsh-better-sidebar', 'context-doctor', 'personal-workbench']) {
    const pluginRoot = join(productRoot, plugin)
    const manifest = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'))
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      if (!isBundledRuntimePackage(name)) continue
      const expected = workspace.get(name)
      if (!expected) throw new Error(`${manifest.name} has no bundled workspace target for ${name}`)
      const installed = join(pluginRoot, 'node_modules', ...name.split('/'))
      if (!existsSync(installed)) throw new Error(`${manifest.name} did not install bundled peer ${name}`)
      const actualRoot = realpathSync(installed)
      const expectedRoot = realpathSync(expected.root)
      if (actualRoot !== expectedRoot) {
        throw new Error(`${manifest.name} installed a second ${name}: ${actualRoot}`)
      }
      checked += 1
    }
  }
  if (checked === 0) throw new Error('no installed XiaoHui product peer links were checked')
  return checked
}

/**
 * Build the isolated overlay used by the local release compatibility smoke.
 *
 * @param {string} workspace
 * @param {string} productRuntimeRoot
 * @returns {string}
 */
export function buildProductSmokeOverlay(workspace, productRuntimeRoot) {
  const value = path => JSON.stringify(path)
  return `- id: web
  config:
    searchProvider: codex

- insert:
    - id: xiaohui-release-codex-auth
      name: dsh-codex-auth
    - id: xiaohui-release-better-sidebar
      name: dsh-better-sidebar
    - id: xiaohui-release-context-doctor
      name: dsh-context-doctor
    - id: xiaohui-release-personal-workbench
      name: dsh-personal-workbench
    - id: xiaohui-release-harbor-evolution
      name: dsh-harbor-evolution
      config:
        projectRoot: ${value(workspace)}
        jobsDir: "jobs"
        harborBin: ${value(join(productRuntimeRoot, 'venv', 'bin', 'harbor'))}
        harborDshBin: ${value(join(productRuntimeRoot, 'venv', 'bin', 'harbor-dsh'))}
        pythonPath: ""
`
}

/**
 * Observe a child close without collapsing its exit code, signal, and timeout.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} milliseconds
 * @returns {Promise<{code: number | null, signal: NodeJS.Signals | null, timedOut: boolean}>}
 */
export function waitForClose(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode, timedOut: false })
  }
  return new Promise(resolveClose => {
    const onClose = (code, signal) => {
      clearTimeout(timer)
      resolveClose({ code, signal, timedOut: false })
    }
    const timer = setTimeout(() => {
      child.off('close', onClose)
      resolveClose({ code: child.exitCode, signal: child.signalCode, timedOut: true })
    }, milliseconds)
    child.once('close', onClose)
  })
}

/**
 * Request graceful Host shutdown, escalating once while preserving the outcome.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {{gracefulMilliseconds?: number, forcedMilliseconds?: number}} options
 * @returns {Promise<{code: number | null, signal: NodeJS.Signals | null, timedOut: boolean, forced: boolean}>}
 */
export async function stopChild(child, options = {}) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode, timedOut: false, forced: false }
  }
  child.kill('SIGTERM')
  const graceful = await waitForClose(child, options.gracefulMilliseconds ?? 10_000)
  if (!graceful.timedOut) return { ...graceful, forced: false }
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      code: child.exitCode,
      signal: child.signalCode,
      timedOut: true,
      forced: false,
    }
  }
  child.kill('SIGKILL')
  const forced = await waitForClose(child, options.forcedMilliseconds ?? 10_000)
  return { ...forced, timedOut: true, forced: true }
}

/**
 * Reject any Host teardown other than a normal code-zero process exit.
 *
 * @param {{code: number | null, signal: NodeJS.Signals | null, timedOut: boolean, forced: boolean}} outcome
 * @param {string} stdout
 * @param {string} stderr
 */
export function assertCleanChildExit(outcome, stdout = '', stderr = '') {
  if (!outcome.timedOut && !outcome.forced && outcome.code === 0 && outcome.signal === null) return
  const status = [
    `code=${outcome.code ?? 'null'}`,
    `signal=${outcome.signal ?? 'null'}`,
    `timedOut=${String(outcome.timedOut)}`,
    `forced=${String(outcome.forced)}`,
  ].join(', ')
  throw new Error(`XiaoHui product Host did not dispose cleanly (${status})\nstdout:\n${stdout}\nstderr:\n${stderr}`)
}

async function fetchOk(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`release smoke request failed: ${url} returned ${response.status}`)
  return response
}

/**
 * Reject an assembled page that did not execute every product Client cleanly.
 *
 * @param {{
 *   clientResponses: Record<string, number>,
 *   pageErrors: string[],
 *   consoleErrors: string[],
 *   bootFailureCount: number,
 *   frameCount: number,
 * }} result
 */
export function assertProductClientBoot(result) {
  const failures = []
  if (result.bootFailureCount > 0) failures.push('the Web boot page reported a plugin activation failure')
  if (result.frameCount === 0) failures.push('the assembled Web application frame never mounted')
  for (const id of PRODUCT_CLIENT_IDS) {
    const status = result.clientResponses[id]
    if (status === undefined) failures.push(`${id} Client bundle was not requested`)
    else if (status !== 200) failures.push(`${id} Client bundle returned HTTP ${status}`)
  }
  for (const error of result.pageErrors) failures.push(`pageerror: ${error}`)
  for (const error of result.consoleErrors) failures.push(`console error: ${error}`)
  if (failures.length > 0) {
    throw new Error(`XiaoHui product Client boot failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`)
  }
}

async function clickOnboardingAction(page, name, waitMilliseconds) {
  const action = page.getByRole('button', { name, exact: true })
  const deadline = Date.now() + waitMilliseconds
  while (Date.now() < deadline) {
    if (await action.count() > 0 && await action.isVisible()) {
      await action.click()
      await action.waitFor({ state: 'detached', timeout: 10_000 })
      return true
    }
    await new Promise(resolvePoll => { setTimeout(resolvePoll, 100) })
  }
  return false
}

async function completeProductOnboarding(page) {
  await clickOnboardingAction(page, 'Continue', 5_000)
  await clickOnboardingAction(page, 'Configure later', 5_000)
}

function buildDesktopBridgeSmokeShell(baseUrl) {
  const externalI18n = '<script src="desktop-i18n.js"></script>'
  if (desktopShellSource.split(externalI18n).length !== 2) {
    throw new Error('desktop shell must contain exactly one desktop-i18n.js script')
  }
  if (/<\/script/iu.test(desktopI18nSource)) {
    throw new Error('desktop-i18n.js cannot be embedded safely in the release smoke')
  }
  const encodedBaseUrl = JSON.stringify(baseUrl).replaceAll('<', '\\u003c')
  const bootstrap = `<script>
    window.__DSH_WEB_URL__ = ${encodedBaseUrl}
    window.__DSH_LOCALE__ = 'en'
    window.__DSH_CHROME__ = { os: 'macos', titlebar_height: 32, left: [], right: [] }
    window.__XIAOHUI_UPDATE_COMMANDS__ = []
    window.__TAURI__ = {
      core: {
        invoke: async (command) => {
          window.__XIAOHUI_UPDATE_COMMANDS__.push(command)
          if (command !== 'check_for_updates') throw new Error('unexpected desktop command: ' + command)
          return ${JSON.stringify(desktopUpdateSmokeResult)}
        },
      },
    }
  </script>
  <script>${desktopI18nSource}</script>`
  return desktopShellSource.replace(externalI18n, bootstrap)
}

async function startDesktopBridgeSmokeServer(baseUrl) {
  const html = buildDesktopBridgeSmokeShell(baseUrl)
  const server = createServer((request, response) => {
    if (request.url === '/app-icon.png' || request.url === '/favicon.ico') {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': 'image/png',
      })
      response.end(desktopAppIcon)
      return
    }
    if (request.url !== '/') {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
    })
    response.end(html)
  })
  await new Promise((resolveListen, rejectListen) => {
    const onError = error => { rejectListen(error) }
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      resolveListen()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('desktop bridge smoke server did not bind a TCP port')
  }
  return { server, url: `http://127.0.0.1:${address.port}/` }
}

function closeDesktopBridgeSmokeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close(error => {
      if (error) rejectClose(error)
      else resolveClose()
    })
  })
}

async function runBrowserSmoke(baseUrl, env) {
  let browser
  let desktopBridgeServer
  let failure
  try {
    if (!existsSync(installedChromiumExecutable)) {
      throw new Error(
        `Playwright Chromium is not installed: ${installedChromiumExecutable}; run pnpm --dir apps/desktop-tauri exec playwright install chromium`,
      )
    }
    browser = await chromium.launch({
      headless: true,
      env,
      executablePath: installedChromiumExecutable,
    })
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: 'en-US' })
    const pageErrors = []
    const consoleErrors = []
    const clientResponses = {}
    page.on('pageerror', error => { pageErrors.push(String(error)) })
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname
      for (const id of PRODUCT_CLIENT_IDS) {
        if (pathname === `/plugins/${id}/client.js`) clientResponses[id] = response.status()
      }
    })

    const navigation = await page.goto(baseUrl, { waitUntil: 'load', timeout: 30_000 })
    if (navigation === null || navigation.status() !== 200) {
      throw new Error(`XiaoHui Web navigation returned HTTP ${navigation?.status() ?? 'no response'}`)
    }
    await page.waitForFunction(
      () => document.querySelector('[class*="frame"]') !== null
        || document.body.textContent?.includes('Failed to load plugins') === true,
      undefined,
      { timeout: 30_000 },
    )
    const frameCount = await page.locator('[class*="frame"]').count()
    if (frameCount > 0) {
      await page.evaluate(() => new Promise(resolveFrame => {
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame))
      }))
    }
    assertProductClientBoot({
      clientResponses,
      pageErrors,
      consoleErrors,
      bootFailureCount: await page.getByText('Failed to load plugins', { exact: true }).count(),
      frameCount,
    })
    await completeProductOnboarding(page)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.waitFor({ timeout: 10_000 })
    const update = settings.getByRole('button', { name: 'Check and update', exact: true })
    await update.waitFor({ timeout: 10_000 })
    if (await update.isEnabled()) {
      throw new Error('standalone XiaoHui Web exposed the desktop-only update action as enabled')
    }
    assertProductClientBoot({
      clientResponses,
      pageErrors,
      consoleErrors,
      bootFailureCount: await page.getByText('Failed to load plugins', { exact: true }).count(),
      frameCount,
    })

    const desktopBridge = await startDesktopBridgeSmokeServer(baseUrl)
    desktopBridgeServer = desktopBridge.server
    const shellNavigation = await page.goto(desktopBridge.url, { waitUntil: 'load', timeout: 30_000 })
    if (shellNavigation === null || shellNavigation.status() !== 200) {
      throw new Error(`XiaoHui desktop shell navigation returned HTTP ${shellNavigation?.status() ?? 'no response'}`)
    }
    const embedded = page.frameLocator('#app')
    try {
      await embedded.locator('[class*="frame"]').first().waitFor({ timeout: 30_000 })
    }
    catch (error) {
      const frameUrls = page.frames().map(frame => frame.url())
      throw new Error(
        `assembled Host did not mount inside the desktop shell; frames=${JSON.stringify(frameUrls)}, pageErrors=${JSON.stringify(pageErrors)}, consoleErrors=${JSON.stringify(consoleErrors)}`,
        { cause: error },
      )
    }
    await completeProductOnboarding(embedded)
    await embedded.getByRole('button', { name: 'Settings', exact: true }).click()
    const embeddedSettings = embedded.getByRole('dialog', { name: 'Settings' })
    await embeddedSettings.waitFor({ timeout: 10_000 })
    const embeddedUpdate = embeddedSettings.getByRole('button', { name: 'Check and update', exact: true })
    await embeddedUpdate.waitFor({ timeout: 10_000 })
    if (!await embeddedUpdate.isEnabled()) {
      throw new Error('desktop XiaoHui shell did not enable the application update action')
    }
    await embeddedUpdate.click()
    await embeddedSettings.getByText(desktopUpdateSmokeResult, { exact: true }).waitFor({ timeout: 10_000 })
    const invokedCommands = await page.evaluate(() => window.__XIAOHUI_UPDATE_COMMANDS__)
    if (JSON.stringify(invokedCommands) !== JSON.stringify(['check_for_updates'])) {
      throw new Error(`desktop update control invoked unexpected commands: ${JSON.stringify(invokedCommands)}`)
    }
    assertProductClientBoot({
      clientResponses,
      pageErrors,
      consoleErrors,
      bootFailureCount: await embedded.getByText('Failed to load plugins', { exact: true }).count(),
      frameCount: await embedded.locator('[class*="frame"]').count(),
    })
  }
  catch (error) {
    failure = error
  }

  const closeFailures = []
  try {
    await browser?.close()
  }
  catch (error) {
    closeFailures.push(error)
  }
  try {
    if (desktopBridgeServer !== undefined) {
      await closeDesktopBridgeSmokeServer(desktopBridgeServer)
    }
  }
  catch (error) {
    closeFailures.push(error)
  }
  const closeFailure = closeFailures.length > 1
    ? new AggregateError(closeFailures, 'XiaoHui desktop shell and browser teardown both failed')
    : closeFailures[0]
  if (failure && closeFailure) {
    throw new AggregateError([failure, closeFailure], 'XiaoHui product browser smoke and teardown both failed')
  }
  if (failure) throw failure
  if (closeFailure) throw closeFailure
}

async function runHostSmoke(root, productRuntimeRoot) {
  const world = mkdtempSync(join(tmpdir(), 'xiaohui-release-smoke-'))
  const overlay = join(world, 'product.overlay.yml')
  writeFileSync(overlay, buildProductSmokeOverlay(world, productRuntimeRoot))
  const env = createReleaseChildEnvironment(world, productRuntimeRoot)
  const child = spawn(process.execPath, [
    join(root, 'apps', 'cli', 'lib', 'bin.js'),
    'web',
    '--patch', overlay,
    '--no-open',
    '--host', '127.0.0.1',
    '--port', '0',
  ], { cwd: world, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  const append = (current, chunk) => `${current}${chunk}`.slice(-32_000)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
  child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })

  let failure
  try {
    const baseUrl = await new Promise((resolveReady, rejectReady) => {
      const deadline = setTimeout(() => {
        rejectReady(new Error(`XiaoHui product Host did not become ready within 60s\nstdout:\n${stdout}\nstderr:\n${stderr}`))
      }, 60_000)
      const inspect = () => {
        const match = stdout.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/u)
        if (!match) return
        clearTimeout(deadline)
        resolveReady(match[1])
      }
      child.stdout.on('data', inspect)
      child.once('error', error => {
        clearTimeout(deadline)
        rejectReady(error)
      })
      child.once('close', (code, signal) => {
        clearTimeout(deadline)
        rejectReady(new Error(
          `XiaoHui product Host exited before readiness (code=${code ?? 'null'}, signal=${signal ?? 'null'})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ))
      })
    })

    await fetchOk(baseUrl)
    const audit = await (await fetchOk(`${baseUrl}/api/context-doctor/audit?detail=developer`)).json()
    if (audit?.ok !== true) throw new Error('Context Doctor release smoke returned an invalid response')
    await runBrowserSmoke(baseUrl, env)
  }
  catch (error) {
    failure = error
  }

  let exitFailure
  let outcome
  try {
    outcome = await stopChild(child)
    assertCleanChildExit(outcome, stdout, stderr)
  }
  catch (error) {
    exitFailure = error
  }
  if (outcome !== undefined && (outcome.code !== null || outcome.signal !== null)) {
    rmSync(world, { recursive: true, force: true })
  }
  else if (exitFailure) {
    exitFailure = new Error(`${exitFailure.message}\nrelease smoke state preserved at ${world}`, { cause: exitFailure })
  }
  if (failure && exitFailure) {
    throw new AggregateError([failure, exitFailure], 'XiaoHui product smoke and Host teardown both failed')
  }
  if (failure) throw failure
  if (exitFailure) throw exitFailure
}

function verifyOfflineArchive(root) {
  const manifest = JSON.parse(readFileSync(join(root, '.bundle-manifest.json'), 'utf8'))
  const archive = join(root, manifest.offlineStore?.path ?? '')
  if (!existsSync(archive)) throw new Error(`prepared offline Store archive is missing: ${archive}`)
  const actual = createHash('sha256').update(readFileSync(archive)).digest('hex')
  if (actual !== manifest.offlineStore.archiveSha256) {
    throw new Error(`prepared offline Store archive digest mismatch: expected ${manifest.offlineStore.archiveSha256}, found ${actual}`)
  }
}

/** Run the complete local release compatibility smoke. */
export async function verifyPreparedProduct(root = harnessRoot, productRuntimeRoot = runtimeRoot) {
  const commandWorld = mkdtempSync(join(tmpdir(), 'xiaohui-release-command-'))
  const env = createReleaseChildEnvironment(commandWorld, productRuntimeRoot)
  try {
    verifyOfflineArchive(root)
    const lockPeers = assertBundledProductPeerLinks(root)
    const installedPeers = assertInstalledProductPeerLinks(root)
    if (lockPeers !== installedPeers) {
      throw new Error(`product peer verification count changed after install: lock=${lockPeers}, installed=${installedPeers}`)
    }
    run(join(productRuntimeRoot, 'venv', 'bin', 'harbor'), ['--version'], { cwd: commandWorld, env })
    run(join(productRuntimeRoot, 'venv', 'bin', 'harbor-dsh'), ['--help'], { cwd: commandWorld, env })
    await runHostSmoke(root, productRuntimeRoot)
    console.log(`verify-product-release: ${installedPeers} bundled runtime peer links, five assembled Client plugins, and the Application updates control passed`)
  }
  finally {
    removeWorkspaceInstallState(root)
    rmSync(commandWorld, { recursive: true, force: true })
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  verifyPreparedProduct().catch(error => {
    console.error(`verify-product-release: ${error.message}`)
    process.exitCode = 1
  })
}
