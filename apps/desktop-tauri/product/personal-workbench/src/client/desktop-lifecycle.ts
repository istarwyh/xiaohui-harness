/** Fixed browser-to-desktop protocol for application lifecycle actions. */

/** Message channel accepted by the XiaoHui desktop shell. */
export const DESKTOP_LIFECYCLE_CHANNEL = 'xiaohui.desktop.lifecycle'

/** Current browser-to-shell protocol version. */
export const DESKTOP_LIFECYCLE_VERSION = 1

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000

/** Lifecycle actions exposed by the trusted desktop shell. */
export type DesktopLifecycleAction = 'check-update' | 'restart'

interface DesktopLifecycleAccepted {
  channel: typeof DESKTOP_LIFECYCLE_CHANNEL
  version: typeof DESKTOP_LIFECYCLE_VERSION
  type: `${DesktopLifecycleAction}-accepted`
  requestId: string
}

interface DesktopLifecycleResult {
  channel: typeof DESKTOP_LIFECYCLE_CHANNEL
  version: typeof DESKTOP_LIFECYCLE_VERSION
  type: `${DesktopLifecycleAction}-response`
  requestId: string
  ok: boolean
  message?: string
  error?: string
}

type DesktopLifecycleResponse = DesktopLifecycleAccepted | DesktopLifecycleResult

/** Options for one manually triggered desktop lifecycle action. */
export interface DesktopLifecycleRequestOptions {
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

/**
 * Report whether the product Client is embedded in a desktop shell.
 *
 * @param target Browser window to inspect.
 * @returns Whether a distinct parent window can service the fixed protocol.
 */
export function isDesktopLifecycleAvailable(
  target: Window | undefined = typeof window === 'undefined' ? undefined : window,
): boolean {
  return target !== undefined && target.parent !== target
}

/**
 * Validate and correlate one desktop lifecycle response.
 *
 * @param value Untrusted postMessage payload.
 * @param requestId Correlation id created for the active request.
 * @param action Lifecycle action associated with the active request.
 * @returns A validated response or undefined.
 */
export function readDesktopLifecycleResponse(
  value: unknown,
  requestId: string,
  action: DesktopLifecycleAction,
): DesktopLifecycleResponse | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const response = value as Record<string, unknown>
  if (response.channel !== DESKTOP_LIFECYCLE_CHANNEL
    || response.version !== DESKTOP_LIFECYCLE_VERSION
    || response.requestId !== requestId) return undefined

  if (response.type === `${action}-accepted`) {
    return Object.keys(response).sort().join(',') === 'channel,requestId,type,version'
      ? response as unknown as DesktopLifecycleAccepted
      : undefined
  }
  if (response.type !== `${action}-response` || typeof response.ok !== 'boolean') return undefined

  const expectedKeys = response.ok
    ? 'channel,message,ok,requestId,type,version'
    : 'channel,error,ok,requestId,type,version'
  if (Object.keys(response).sort().join(',') !== expectedKeys) return undefined
  if (response.ok) {
    if (typeof response.message !== 'string' || response.message.length > 2048) return undefined
  }
  else if (typeof response.error !== 'string' || response.error.length > 2048) {
    return undefined
  }
  return response as unknown as DesktopLifecycleResponse
}

/**
 * Ask the trusted parent shell to run one allowlisted lifecycle action.
 *
 * A successful restart terminates the current process, so its promise remains
 * pending after the shell acknowledges the request. Native failures reject it.
 *
 * @param action Fixed lifecycle action selected by the settings card.
 * @param options Window, correlation, and timeout overrides.
 * @returns Native status when the action completes without an application restart.
 */
export function requestDesktopLifecycle(
  action: DesktopLifecycleAction,
  options: DesktopLifecycleRequestOptions = {},
): Promise<string> {
  const target = options.target ?? window
  if (!isDesktopLifecycleAvailable(target)) {
    return Promise.reject(new Error('desktop-shell-unavailable'))
  }
  const requestId = options.requestId ?? createRequestId()
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return Promise.reject(new Error('desktop-lifecycle-request-id-invalid'))
  }

  return new Promise((resolve, reject) => {
    const parent = target.parent
    let handshakeTimeout: number | undefined
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (event.source !== parent) return
      const response = readDesktopLifecycleResponse(event.data, requestId, action)
      if (response === undefined) return
      if (response.type === `${action}-accepted`) {
        if (handshakeTimeout !== undefined) target.clearTimeout(handshakeTimeout)
        handshakeTimeout = undefined
        return
      }
      const result = response as DesktopLifecycleResult
      cleanup()
      if (result.ok) resolve(result.message ?? '')
      else reject(new Error(result.error ?? `desktop-${action}-failed`))
    }
    handshakeTimeout = target.setTimeout(() => {
      cleanup()
      reject(new Error('desktop-shell-unavailable'))
    }, options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS)
    const cleanup = (): void => {
      if (handshakeTimeout !== undefined) target.clearTimeout(handshakeTimeout)
      handshakeTimeout = undefined
      target.removeEventListener('message', onMessage)
    }

    target.addEventListener('message', onMessage)
    parent.postMessage({
      channel: DESKTOP_LIFECYCLE_CHANNEL,
      version: DESKTOP_LIFECYCLE_VERSION,
      type: `${action}-request`,
      requestId,
    }, '*')
  })
}

/** Request a signed application update check. */
export function requestDesktopUpdate(options: DesktopLifecycleRequestOptions = {}): Promise<string> {
  return requestDesktopLifecycle('check-update', options)
}

/** Request a full XiaoHui process and private Host restart. */
export function requestDesktopRestart(options: DesktopLifecycleRequestOptions = {}): Promise<string> {
  return requestDesktopLifecycle('restart', options)
}
