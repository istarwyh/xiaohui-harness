/** Fixed browser-to-desktop protocol for requesting a signed application update. */

/** Message channel accepted by the XiaoHui desktop shell. */
export const DESKTOP_UPDATE_CHANNEL = 'xiaohui.desktop.update'

/** Current browser-to-shell protocol version. */
export const DESKTOP_UPDATE_VERSION = 1

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000

interface DesktopUpdateAccepted {
  channel: typeof DESKTOP_UPDATE_CHANNEL
  version: typeof DESKTOP_UPDATE_VERSION
  type: 'check-accepted'
  requestId: string
}

interface DesktopUpdateResult {
  channel: typeof DESKTOP_UPDATE_CHANNEL
  version: typeof DESKTOP_UPDATE_VERSION
  type: 'check-response'
  requestId: string
  ok: boolean
  message?: string
  error?: string
}

type DesktopUpdateResponse = DesktopUpdateAccepted | DesktopUpdateResult

/** Options for one manually triggered desktop update check. */
export interface DesktopUpdateRequestOptions {
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
export function isDesktopUpdateAvailable(
  target: Window | undefined = typeof window === 'undefined' ? undefined : window,
): boolean {
  return target !== undefined && target.parent !== target
}

/**
 * Validate and correlate one desktop update response.
 *
 * @param value Untrusted postMessage payload.
 * @param requestId Correlation id created for the active request.
 * @returns A validated response or undefined.
 */
export function readDesktopUpdateResponse(
  value: unknown,
  requestId: string,
): DesktopUpdateResponse | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const response = value as Record<string, unknown>
  if (response.channel !== DESKTOP_UPDATE_CHANNEL
    || response.version !== DESKTOP_UPDATE_VERSION
    || response.requestId !== requestId) return undefined

  if (response.type === 'check-accepted') {
    return Object.keys(response).sort().join(',') === 'channel,requestId,type,version'
      ? response as unknown as DesktopUpdateAccepted
      : undefined
  }
  if (response.type !== 'check-response' || typeof response.ok !== 'boolean') return undefined

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
  return response as unknown as DesktopUpdateResponse
}

/**
 * Ask the trusted parent shell to run the signed update flow.
 *
 * @param options Window, correlation, and timeout overrides.
 * @returns Localized native status when no application restart begins.
 */
export function requestDesktopUpdate(options: DesktopUpdateRequestOptions = {}): Promise<string> {
  const target = options.target ?? window
  if (!isDesktopUpdateAvailable(target)) {
    return Promise.reject(new Error('desktop-shell-unavailable'))
  }
  const requestId = options.requestId ?? createRequestId()
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return Promise.reject(new Error('desktop-update-request-id-invalid'))
  }

  return new Promise((resolve, reject) => {
    const parent = target.parent
    let handshakeTimeout: number | undefined
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (event.source !== parent) return
      const response = readDesktopUpdateResponse(event.data, requestId)
      if (response === undefined) return
      if (response.type === 'check-accepted') {
        if (handshakeTimeout !== undefined) target.clearTimeout(handshakeTimeout)
        handshakeTimeout = undefined
        return
      }
      cleanup()
      if (response.ok) resolve(response.message ?? '')
      else reject(new Error(response.error ?? 'desktop-update-failed'))
    }
    handshakeTimeout = target.setTimeout(() => {
      cleanup()
      reject(new Error('desktop-update-shell-unavailable'))
    }, options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS)
    const cleanup = (): void => {
      if (handshakeTimeout !== undefined) target.clearTimeout(handshakeTimeout)
      handshakeTimeout = undefined
      target.removeEventListener('message', onMessage)
    }

    target.addEventListener('message', onMessage)
    parent.postMessage({
      channel: DESKTOP_UPDATE_CHANNEL,
      version: DESKTOP_UPDATE_VERSION,
      type: 'check-request',
      requestId,
    }, '*')
  })
}
