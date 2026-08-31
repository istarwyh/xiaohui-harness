/** Fixed Node Host reachability probe for the active application proxy. */

import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

/** Same-origin endpoint used by the Personal Workbench settings card. */
export const HOST_NETWORK_PROXY_TEST_PATH = '/api/xiaohui/network-proxy/test'

const CHATGPT_REACHABILITY_URL = 'https://chatgpt.com/'
const HOST_PROXY_TEST_TIMEOUT_MS = 15_000
const ENVIRONMENT_PROXY_DISPATCHER_MARK = Symbol.for(
  '@deepseek-ai/dsh.environment-proxy-dispatcher',
)

/** Safe result returned to the loopback Client without URLs or credentials. */
export interface HostNetworkProxyTestResult {
  ok: boolean
  status: number
  proxied: boolean
  errorCode: string
}

/** Minimal fetch operation accepted by the deterministic Host tests. */
export type HostNetworkProxyFetch = (
  input: string,
  init: { signal: AbortSignal },
) => Promise<{ status: number }>

function hasProxyEnvironment(environment: NodeJS.ProcessEnv): boolean {
  return [
    environment.https_proxy,
    environment.HTTPS_PROXY,
    environment.http_proxy,
    environment.HTTP_PROXY,
  ].some(value => value !== undefined && value.length > 0)
}

function hasEnvironmentProxyDispatcher(): boolean {
  return Reflect.get(globalThis, ENVIRONMENT_PROXY_DISPATCHER_MARK) === true
}

function safeErrorCode(error: unknown): string {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current !== undefined; depth += 1) {
    if (current !== null && typeof current === 'object') {
      const value = current as { cause?: unknown, code?: unknown, name?: unknown }
      if (typeof value.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(value.code)) {
        return value.code
      }
      if (typeof value.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value.name)) {
        if (value.name !== 'Error' && value.name !== 'TypeError') return value.name
      }
      current = value.cause
      continue
    }
    break
  }
  return 'UNKNOWN'
}

/**
 * Connect from the running Node Host through its installed global dispatcher.
 * @param fetcher - Host-realm fetch implementation.
 * @param environment - active Host environment used only for the boolean route fact.
 * @param dispatcherInstalled - process-local proof that the CLI installed the proxy dispatcher.
 * @returns a credential-free reachability result with a bounded error code.
 */
export async function testHostNetworkProxy(
  fetcher: HostNetworkProxyFetch = globalThis.fetch,
  environment: NodeJS.ProcessEnv = process.env,
  dispatcherInstalled: boolean = hasEnvironmentProxyDispatcher(),
): Promise<HostNetworkProxyTestResult> {
  const proxyConfigured = hasProxyEnvironment(environment)
  const proxied = proxyConfigured && dispatcherInstalled
  if (proxyConfigured && !dispatcherInstalled) {
    return { ok: false, status: 0, proxied, errorCode: 'ENV_PROXY_DISPATCHER_MISSING' }
  }
  try {
    const response = await fetcher(CHATGPT_REACHABILITY_URL, {
      signal: AbortSignal.timeout(HOST_PROXY_TEST_TIMEOUT_MS),
    })
    if (response.status === 407 || response.status >= 500) {
      return { ok: false, status: response.status, proxied, errorCode: `HTTP_${response.status}` }
    }
    return { ok: true, status: response.status, proxied, errorCode: '' }
  } catch (error) {
    return { ok: false, status: 0, proxied, errorCode: safeErrorCode(error) }
  }
}

function writeJson(
  response: Parameters<WebRoute['handler']>[1],
  status: number,
  value: HostNetworkProxyTestResult | { ok: false, error: string },
): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

/**
 * Create the same-origin POST route that exercises the current Host realm.
 * The JSON media type forces cross-origin browsers through CORS preflight.
 * @param fetcher - Host fetch implementation, replaced only by deterministic tests.
 * @returns one exact WebServer route.
 */
export function createHostNetworkProxyRoute(
  fetcher: HostNetworkProxyFetch = globalThis.fetch,
): WebRoute {
  return {
    kind: 'exact',
    path: HOST_NETWORK_PROXY_TEST_PATH,
    handler: async (request, response) => {
      if (request.method !== 'POST') {
        writeJson(response, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      const mediaType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
      if (mediaType !== 'application/json') {
        writeJson(response, 415, { ok: false, error: 'application-json-required' })
        return
      }
      const result = await testHostNetworkProxy(fetcher)
      writeJson(response, result.ok ? 200 : 502, result)
    },
  }
}
