import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createHostNetworkProxyRoute,
  HOST_NETWORK_PROXY_TEST_PATH,
  testHostNetworkProxy,
  type HostNetworkProxyFetch,
} from '../src/host-network-proxy.ts'

const servers = new Set<ReturnType<typeof createServer>>()

async function invokeRoute(
  route: ReturnType<typeof createHostNetworkProxyRoute>,
  method: string,
  contentType?: string,
): Promise<{ body: unknown, status: number }> {
  const server = createServer((incoming, outgoing) => {
    void route.handler(incoming, outgoing)
  })
  servers.add(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port
  return await new Promise((resolve, reject) => {
    const outgoing = request({
      host: '127.0.0.1',
      port,
      method,
      path: HOST_NETWORK_PROXY_TEST_PATH,
      ...(contentType === undefined ? {} : { headers: { 'Content-Type': contentType } }),
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () => resolve({
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        status: response.statusCode ?? 0,
      }))
    })
    outgoing.once('error', reject)
    outgoing.end()
  })
}

afterEach(async () => {
  await Promise.all([...servers].map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error === undefined ? resolve() : reject(error))
  })))
  servers.clear()
})

describe('Personal Workbench Host network proxy diagnostic', () => {
  it('reports the active environment route without returning its URL', async () => {
    const fetcher: HostNetworkProxyFetch = async (input, init) => {
      expect(input).toBe('https://chatgpt.com/')
      expect(init.signal).toBeInstanceOf(AbortSignal)
      return { status: 204 }
    }
    const result = await testHostNetworkProxy(
      fetcher,
      { HTTPS_PROXY: 'http://proxy-user:proxy-password@127.0.0.1:7890' },
      true,
    )
    expect(result).toEqual({ ok: true, status: 204, proxied: true, errorCode: '' })
    expect(JSON.stringify(result)).not.toContain('proxy-user')
    expect(JSON.stringify(result)).not.toContain('7890')
  })

  it('projects only a bounded transport cause code', async () => {
    const fetcher: HostNetworkProxyFetch = async () => {
      throw new TypeError('fetch failed for http://proxy-user:proxy-password@127.0.0.1:7890', {
        cause: Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
      })
    }
    const result = await testHostNetworkProxy(
      fetcher,
      { HTTP_PROXY: 'http://127.0.0.1:7890' },
      true,
    )
    expect(result).toEqual({
      ok: false,
      status: 0,
      proxied: true,
      errorCode: 'UND_ERR_CONNECT_TIMEOUT',
    })
    expect(JSON.stringify(result)).not.toContain('proxy-password')
  })

  it('fails before fetch when proxy variables exist without CLI dispatcher proof', async () => {
    const fetcher: HostNetworkProxyFetch = async () => {
      throw new Error('fetch must not run')
    }
    await expect(testHostNetworkProxy(
      fetcher,
      { HTTPS_PROXY: 'http://127.0.0.1:7890' },
      false,
    )).resolves.toEqual({
      ok: false,
      status: 0,
      proxied: false,
      errorCode: 'ENV_PROXY_DISPATCHER_MISSING',
    })
  })

  it('rejects cross-site simple requests and serves the fixed JSON POST', async () => {
    const route = createHostNetworkProxyRoute(async () => ({ status: 200 }))
    await expect(invokeRoute(route, 'GET')).resolves.toEqual({
      body: { ok: false, error: 'method-not-allowed' },
      status: 405,
    })
    await expect(invokeRoute(route, 'POST', 'text/plain')).resolves.toEqual({
      body: { ok: false, error: 'application-json-required' },
      status: 415,
    })
    await expect(invokeRoute(route, 'POST', 'application/json; charset=utf-8')).resolves.toEqual({
      body: { ok: true, status: 200, proxied: false, errorCode: '' },
      status: 200,
    })
  })
})
