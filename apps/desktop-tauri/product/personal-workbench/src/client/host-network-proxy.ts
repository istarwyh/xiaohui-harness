/** Same-origin browser client for the active Node Host proxy diagnostic. */

const HOST_NETWORK_PROXY_TEST_PATH = '/api/xiaohui/network-proxy/test'

/** Credential-free result from the active Node Host process. */
export interface HostNetworkProxyTestResult {
  ok: boolean
  status: number
  proxied: boolean
  errorCode: string
}

/** Minimal fetch implementation accepted by deterministic browser tests. */
export type HostNetworkProxyFetch = (
  input: string,
  init: RequestInit,
) => Promise<{ json: () => Promise<unknown> }>

function hasExactKeys(value: Record<string, unknown>, expected: string): boolean {
  return Object.keys(value).sort().join(',') === expected
}

function readResult(value: unknown): HostNetworkProxyTestResult | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result = value as Record<string, unknown>
  if (!hasExactKeys(result, 'errorCode,ok,proxied,status')
    || typeof result.ok !== 'boolean'
    || typeof result.status !== 'number'
    || !Number.isInteger(result.status)
    || result.status < 0
    || result.status > 599
    || typeof result.proxied !== 'boolean'
    || typeof result.errorCode !== 'string'
    || result.errorCode.length > 64) return undefined
  return result as unknown as HostNetworkProxyTestResult
}

/**
 * Ask the currently running Node Host to reach ChatGPT through global fetch.
 * @param fetcher - same-origin browser fetch implementation.
 * @returns the strictly validated credential-free diagnostic result.
 */
export async function requestHostNetworkProxyTest(
  fetcher: HostNetworkProxyFetch = globalThis.fetch,
): Promise<HostNetworkProxyTestResult> {
  const response = await fetcher(HOST_NETWORK_PROXY_TEST_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const result = readResult(await response.json())
  if (result === undefined) throw new Error('host-network-proxy-response-invalid')
  return result
}
