import { createServer } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'
import { hasEnvironmentProxy } from '../src/environment-proxy.ts'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const sourceBin = join(repoRoot, 'apps/cli/src/bin.ts')
const builtBin = join(repoRoot, 'apps/cli/lib/bin.js')
const temporaryHomes: string[] = []

interface ConnectProxy {
  authorities: string[]
  close: () => Promise<void>
  requests: string[]
  url: string
}

function createProbeProfile(): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-environment-proxy-'))
  temporaryHomes.push(home)
  const bundleDir = join(home, 'proxy-probe-bundle')
  const profileDir = join(home, 'profiles', 'proxy-probe')
  const installedBundle = join(profileDir, 'node_modules', 'dsh-proxy-probe-bundle')
  mkdirSync(bundleDir, { recursive: true })
  mkdirSync(installedBundle, { recursive: true })
  writeFileSync(join(bundleDir, 'plugin.mjs'), [
    "export const name = 'proxy-probe'",
    'export function apply() {',
    '  void (async () => {',
    "    let result = ''",
    '    try {',
    '      const response = await fetch(process.env.PROXY_PROBE_URL, { signal: AbortSignal.timeout(5_000) })',
    '      result = await response.text()',
    '    } catch (error) {',
    "      result = `ERROR:${error?.cause?.code ?? error?.code ?? error?.name ?? 'unknown'}`",
    '    }',
    '    process.stdout.write(`${result}\\n`)',
    '    process.exit(0)',
    '  })()',
    '}',
    '',
  ].join('\n'))
  writeFileSync(join(bundleDir, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: proxy-probe',
    `      name: ${pathToFileURL(join(bundleDir, 'plugin.mjs')).href}`,
    '',
  ].join('\n'))
  writeFileSync(join(bundleDir, 'package.json'), JSON.stringify({
    name: 'dsh-proxy-probe-bundle',
    version: '0.0.0',
    type: 'module',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, undefined, 2))
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-proxy-probe',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['dsh-proxy-probe-bundle'] } },
  }, undefined, 2))
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '[]\n')
  for (const file of ['plugin.mjs', 'cordis.patch.yml', 'package.json']) {
    writeFileSync(join(installedBundle, file), readFileSync(join(bundleDir, file)))
  }
  return home
}

async function startConnectProxy(): Promise<ConnectProxy> {
  const authorities: string[] = []
  const requests: string[] = []
  const sockets = new Set<Socket>()
  const server = createServer((request, response) => {
    requests.push(request.url ?? '')
    const body = 'PROXY_OK'
    response.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Length': Buffer.byteLength(body),
    })
    response.end(body)
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  server.on('connect', (request, socket, head) => {
    void head
    authorities.push(request.url ?? '')
    socket.destroy()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return {
    authorities,
    requests,
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    },
  }
}

async function runProbe(
  home: string, proxy: string, noProxy: string,
  target = 'http://proxy-only.invalid/probe',
): Promise<string> {
  const entry = process.env.DSH_TEST_BUILT_PROXY_BIN === '1'
    ? [builtBin]
    : ['--import', 'tsx/esm', sourceBin]
  const result = await execa(process.execPath, [...entry, '--profile', 'proxy-probe'], {
    cwd: repoRoot,
    reject: false,
    timeout: 20_000,
    env: {
      ...process.env,
      DSH_HOME: home,
      HTTP_PROXY: proxy,
      HTTPS_PROXY: proxy,
      http_proxy: proxy,
      https_proxy: proxy,
      NO_PROXY: noProxy,
      no_proxy: noProxy,
      NODE_USE_ENV_PROXY: undefined,
      PROXY_PROBE_URL: target,
    },
  })
  if (result.timedOut) {
    throw new Error(`proxy probe timed out: stdout=${result.stdout} stderr=${result.stderr}`)
  }
  expect(result.exitCode).toBe(0)
  return result.stdout.trim()
}

afterEach(() => {
  for (const home of temporaryHomes) rmSync(home, { recursive: true, force: true })
  temporaryHomes.length = 0
})

describe('CLI environment proxy bootstrap', () => {
  it('recognizes only non-empty HTTP(S) proxy variables', () => {
    expect(hasEnvironmentProxy({})).toBe(false)
    expect(hasEnvironmentProxy({ HTTPS_PROXY: '' })).toBe(false)
    expect(hasEnvironmentProxy({ HTTP_PROXY: 'http://127.0.0.1:7890' })).toBe(true)
    expect(hasEnvironmentProxy({ https_proxy: 'http://127.0.0.1:7890' })).toBe(true)
  })

  it('routes profile global fetch through HTTP proxy and CONNECT while honoring NO_PROXY', {
    timeout: 40_000,
  }, async () => {
    const proxy = await startConnectProxy()
    try {
      const proxied = await runProbe(createProbeProfile(), proxy.url, 'localhost,127.0.0.1,::1')
      expect({ output: proxied, requests: proxy.requests })
        .toEqual({ output: 'PROXY_OK', requests: ['http://proxy-only.invalid/probe'] })

      const tunnel = await runProbe(
        createProbeProfile(), proxy.url, 'localhost,127.0.0.1,::1',
        'https://proxy-only.invalid/probe',
      )
      expect(tunnel).toMatch(/^ERROR:/)
      expect(proxy.authorities).toEqual(['proxy-only.invalid:443'])

      const bypassed = await runProbe(
        createProbeProfile(), proxy.url, 'localhost,127.0.0.1,::1,proxy-only.invalid',
      )
      expect(bypassed).toMatch(/^ERROR:/)
      expect(proxy.requests).toEqual(['http://proxy-only.invalid/probe'])
      expect(proxy.authorities).toEqual(['proxy-only.invalid:443'])
    } finally {
      await proxy.close()
    }
  })
})
