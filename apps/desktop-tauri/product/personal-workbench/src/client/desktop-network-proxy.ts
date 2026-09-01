/** Fixed browser-to-desktop protocol for application-wide network proxy settings. */

/** Message channel accepted by the XiaoHui desktop shell. */
export const DESKTOP_NETWORK_PROXY_CHANNEL = 'xiaohui.desktop.network-proxy'

/** Current browser-to-shell protocol version. */
export const DESKTOP_NETWORK_PROXY_VERSION = 2

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000
const MAX_PROXY_URL_LENGTH = 2_048
const MAX_NO_PROXY_LENGTH = 4_096

/** User-selectable proxy source. */
export type NetworkProxyMode = 'direct' | 'system' | 'custom'

/** Persisted desktop proxy preferences. */
export interface NetworkProxySettings {
  mode: NetworkProxyMode
  httpProxy: string
  httpsProxy: string
  noProxy: string
}

/** Browser-safe effective proxy state. */
export interface EffectiveNetworkProxy extends NetworkProxySettings {}

/** Current macOS System Configuration detection. */
export interface SystemNetworkProxy {
  supported: boolean
  configured: boolean
  httpProxy: string
  httpsProxy: string
  noProxy: string
  autoConfigUrl: string
  error: string
}

/** Initial settings and detection state returned by the native shell. */
export interface NetworkProxySnapshot {
  settings: NetworkProxySettings
  system: SystemNetworkProxy
  effective?: EffectiveNetworkProxy
  effectiveError: string
}

/** Result of one ChatGPT reachability check. */
export interface NetworkProxyTestResult {
  ok: boolean
  status: number
  proxied: boolean
  errorCode: string
}

type DesktopNetworkProxyAction = 'get' | 'test' | 'save'
type DesktopNetworkProxyValue = NetworkProxySnapshot | NetworkProxyTestResult

interface DesktopNetworkProxyAccepted {
  channel: typeof DESKTOP_NETWORK_PROXY_CHANNEL
  version: typeof DESKTOP_NETWORK_PROXY_VERSION
  type: `${DesktopNetworkProxyAction}-accepted`
  requestId: string
}

interface DesktopNetworkProxyResult {
  channel: typeof DESKTOP_NETWORK_PROXY_CHANNEL
  version: typeof DESKTOP_NETWORK_PROXY_VERSION
  type: `${DesktopNetworkProxyAction}-response`
  requestId: string
  ok: boolean
  value?: DesktopNetworkProxyValue
  error?: string
}

type DesktopNetworkProxyResponse = DesktopNetworkProxyAccepted | DesktopNetworkProxyResult

/** Options for one desktop proxy request. */
export interface DesktopNetworkProxyRequestOptions {
  /** Browser window hosting the product Client. */
  target?: Window
  /** Correlation id override used by deterministic tests. */
  requestId?: string
  /** Maximum wait for the trusted Shell to acknowledge the request. */
  handshakeTimeoutMs?: number
}

function createRequestId(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Report whether the product Client is embedded in a desktop shell. */
export function isDesktopNetworkProxyAvailable(
  target: Window | undefined = typeof window === 'undefined' ? undefined : window,
): boolean {
  return target !== undefined && target.parent !== target
}

function hasExactKeys(value: Record<string, unknown>, expected: string): boolean {
  return Object.keys(value).sort().join(',') === expected
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Validate a settings value received from the native shell. */
export function readNetworkProxySettings(value: unknown): NetworkProxySettings | undefined {
  if (!isRecord(value)
    || !hasExactKeys(value, 'httpProxy,httpsProxy,mode,noProxy')
    || !['direct', 'system', 'custom'].includes(String(value.mode))
    || typeof value.httpProxy !== 'string'
    || value.httpProxy.length > MAX_PROXY_URL_LENGTH
    || typeof value.httpsProxy !== 'string'
    || value.httpsProxy.length > MAX_PROXY_URL_LENGTH
    || typeof value.noProxy !== 'string'
    || value.noProxy.length > MAX_NO_PROXY_LENGTH) return undefined
  return value as unknown as NetworkProxySettings
}

function readEffectiveProxy(value: unknown): EffectiveNetworkProxy | undefined {
  return readNetworkProxySettings(value)
}

function readSystemProxy(value: unknown): SystemNetworkProxy | undefined {
  if (!isRecord(value)
    || !hasExactKeys(
      value,
      'autoConfigUrl,configured,error,httpProxy,httpsProxy,noProxy,supported',
    )
    || typeof value.supported !== 'boolean'
    || typeof value.configured !== 'boolean'
    || typeof value.httpProxy !== 'string'
    || value.httpProxy.length > MAX_PROXY_URL_LENGTH
    || typeof value.httpsProxy !== 'string'
    || value.httpsProxy.length > MAX_PROXY_URL_LENGTH
    || typeof value.noProxy !== 'string'
    || value.noProxy.length > MAX_NO_PROXY_LENGTH
    || typeof value.autoConfigUrl !== 'string'
    || value.autoConfigUrl.length > MAX_PROXY_URL_LENGTH
    || typeof value.error !== 'string'
    || value.error.length > MAX_PROXY_URL_LENGTH) return undefined
  return value as unknown as SystemNetworkProxy
}

function readSnapshot(value: unknown): NetworkProxySnapshot | undefined {
  if (!isRecord(value)) return undefined
  const keys = Object.keys(value).sort().join(',')
  if (keys !== 'effective,effectiveError,settings,system'
    && keys !== 'effectiveError,settings,system') return undefined
  const settings = readNetworkProxySettings(value.settings)
  const system = readSystemProxy(value.system)
  if (settings === undefined
    || system === undefined
    || typeof value.effectiveError !== 'string'
    || value.effectiveError.length > MAX_PROXY_URL_LENGTH) return undefined
  const effective = value.effective === undefined
    ? undefined
    : readEffectiveProxy(value.effective)
  if (value.effective !== undefined && effective === undefined) return undefined
  return {
    settings,
    system,
    ...(effective === undefined ? {} : { effective }),
    effectiveError: value.effectiveError,
  }
}

function readTestResult(value: unknown): NetworkProxyTestResult | undefined {
  if (!isRecord(value)
    || !hasExactKeys(value, 'errorCode,ok,proxied,status')
    || typeof value.ok !== 'boolean'
    || typeof value.proxied !== 'boolean'
    || !Number.isSafeInteger(value.status)
    || Number(value.status) < 0
    || Number(value.status) > 599
    || typeof value.errorCode !== 'string'
    || !/^[A-Z0-9_]{0,64}$/.test(value.errorCode)
    || (value.ok && (Number(value.status) < 100 || value.errorCode !== ''))
    || (!value.ok && value.errorCode === '')) return undefined
  return value as unknown as NetworkProxyTestResult
}

/** Validate and correlate one network-proxy response. */
export function readDesktopNetworkProxyResponse(
  value: unknown,
  requestId: string,
  action: DesktopNetworkProxyAction,
): DesktopNetworkProxyResponse | undefined {
  if (!isRecord(value)
    || value.channel !== DESKTOP_NETWORK_PROXY_CHANNEL
    || value.version !== DESKTOP_NETWORK_PROXY_VERSION
    || value.requestId !== requestId) return undefined
  if (value.type === `${action}-accepted`) {
    return hasExactKeys(value, 'channel,requestId,type,version')
      ? value as unknown as DesktopNetworkProxyAccepted
      : undefined
  }
  if (value.type !== `${action}-response` || typeof value.ok !== 'boolean') return undefined
  if (value.ok) {
    if (!hasExactKeys(value, 'channel,ok,requestId,type,value,version')) return undefined
    const parsed = action === 'test' ? readTestResult(value.value) : readSnapshot(value.value)
    if (parsed === undefined) return undefined
  }
  else if (!hasExactKeys(value, 'channel,error,ok,requestId,type,version')
    || typeof value.error !== 'string'
    || value.error.length > MAX_PROXY_URL_LENGTH) return undefined
  return value as unknown as DesktopNetworkProxyResult
}

function requestDesktopNetworkProxy(
  action: DesktopNetworkProxyAction,
  settings: NetworkProxySettings | undefined,
  options: DesktopNetworkProxyRequestOptions,
): Promise<DesktopNetworkProxyValue> {
  const target = options.target ?? window
  if (!isDesktopNetworkProxyAvailable(target)) {
    return Promise.reject(new Error('desktop-shell-unavailable'))
  }
  const requestId = options.requestId ?? createRequestId()
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return Promise.reject(new Error('desktop-network-proxy-request-id-invalid'))
  }
  if (action !== 'get' && readNetworkProxySettings(settings) === undefined) {
    return Promise.reject(new Error('desktop-network-proxy-settings-invalid'))
  }

  return new Promise((resolve, reject) => {
    const parent = target.parent
    let handshakeTimeout: number | undefined
    const cleanup = (): void => {
      if (handshakeTimeout !== undefined) target.clearTimeout(handshakeTimeout)
      handshakeTimeout = undefined
      target.removeEventListener('message', onMessage)
    }
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (event.source !== parent) return
      const response = readDesktopNetworkProxyResponse(event.data, requestId, action)
      if (response === undefined) return
      if (response.type === `${action}-accepted`) {
        if (handshakeTimeout !== undefined) target.clearTimeout(handshakeTimeout)
        handshakeTimeout = undefined
        return
      }
      cleanup()
      const result = response as DesktopNetworkProxyResult
      if (result.ok && result.value !== undefined) resolve(result.value)
      else reject(new Error(result.error ?? `desktop-network-proxy-${action}-failed`))
    }
    handshakeTimeout = target.setTimeout(() => {
      cleanup()
      reject(new Error('desktop-shell-unavailable'))
    }, options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS)
    target.addEventListener('message', onMessage)
    parent.postMessage({
      channel: DESKTOP_NETWORK_PROXY_CHANNEL,
      version: DESKTOP_NETWORK_PROXY_VERSION,
      type: `${action}-request`,
      requestId,
      ...(settings === undefined ? {} : { settings }),
    }, '*')
  })
}

/** Load saved preferences and the current macOS system proxy. */
export async function requestDesktopNetworkProxySnapshot(
  options: DesktopNetworkProxyRequestOptions = {},
): Promise<NetworkProxySnapshot> {
  return await requestDesktopNetworkProxy('get', undefined, options) as NetworkProxySnapshot
}

/** Test one candidate selection against ChatGPT without saving it. */
export async function requestDesktopNetworkProxyTest(
  settings: NetworkProxySettings,
  options: DesktopNetworkProxyRequestOptions = {},
): Promise<NetworkProxyTestResult> {
  return await requestDesktopNetworkProxy('test', settings, options) as NetworkProxyTestResult
}

/** Persist one candidate selection for the next application process. */
export async function requestDesktopNetworkProxySave(
  settings: NetworkProxySettings,
  options: DesktopNetworkProxyRequestOptions = {},
): Promise<NetworkProxySnapshot> {
  return await requestDesktopNetworkProxy('save', settings, options) as NetworkProxySnapshot
}
