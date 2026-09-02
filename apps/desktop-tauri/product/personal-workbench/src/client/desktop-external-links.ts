/** Desktop-only handling for safe external links rendered inside the Host iframe. */

import type { Context } from '@deepseek-ai/cordis'
import type { PersonalWorkbenchKey } from './locales.ts'

/** Versioned channel shared with the XiaoHui desktop shell. */
export const DESKTOP_EXTERNAL_LINK_CHANNEL = 'xiaohui.desktop.external-link'
/** Protocol version for desktop external-link requests. */
export const DESKTOP_EXTERNAL_LINK_VERSION = 1

const MAX_EXTERNAL_URL_LENGTH = 4096
const RESPONSE_TIMEOUT_MS = 5_000
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

type Translate = (key: PersonalWorkbenchKey) => string

interface ExternalLinkResponse {
  channel: typeof DESKTOP_EXTERNAL_LINK_CHANNEL
  version: typeof DESKTOP_EXTERNAL_LINK_VERSION
  type: 'open-response'
  requestId: string
  ok: boolean
  error?: string
}

interface ExternalLinkRequestOptions {
  target?: Window
  requestId?: string
  timeoutMs?: number
}

/**
 * Resolve an untrusted absolute URL that the desktop shell may open.
 * @param value - Raw anchor destination.
 * @param currentOrigin - Embedded Host origin whose own routes stay in the WebView.
 * @returns A normalized external HTTP(S) URL, or undefined for local and unsafe values.
 */
export function resolveDesktopExternalHttpUrl(
  value: string,
  currentOrigin: string,
): string | undefined {
  if (value.length === 0 || value.length > MAX_EXTERNAL_URL_LENGTH) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)
      || url.hostname === ''
      || url.username !== ''
      || url.password !== ''
      || url.origin === currentOrigin
      || url.href.length > MAX_EXTERNAL_URL_LENGTH) return undefined
    return url.href
  }
  catch {
    return undefined
  }
}

/**
 * Parse one correlated shell response without accepting extra command fields.
 * @param value - Untrusted postMessage payload.
 * @param requestId - Request being completed.
 * @returns The validated response, or undefined when it is unrelated or malformed.
 */
export function readDesktopExternalLinkResponse(
  value: unknown,
  requestId: string,
): ExternalLinkResponse | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const response = value as Record<string, unknown>
  if (response.channel !== DESKTOP_EXTERNAL_LINK_CHANNEL
    || response.version !== DESKTOP_EXTERNAL_LINK_VERSION
    || response.type !== 'open-response'
    || response.requestId !== requestId
    || typeof response.ok !== 'boolean') return undefined
  const expectedKeys = response.ok
    ? 'channel,ok,requestId,type,version'
    : 'channel,error,ok,requestId,type,version'
  if (Object.keys(response).sort().join(',') !== expectedKeys) return undefined
  if (!response.ok && (typeof response.error !== 'string' || response.error.length > 2048)) {
    return undefined
  }
  return response as unknown as ExternalLinkResponse
}

function createRequestId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Ask the trusted parent shell to open one validated external URL.
 * @param url - Normalized HTTP(S) destination.
 * @param options - Test seams for the target window, request id, and response deadline.
 * @returns A promise settled by the correlated shell response.
 */
export function requestDesktopExternalLinkOpen(
  url: string,
  options: ExternalLinkRequestOptions = {},
): Promise<void> {
  const target = options.target ?? window
  if (target.parent === target) return Promise.reject(new Error('desktop-shell-unavailable'))
  const requestId = options.requestId ?? createRequestId()
  if (!REQUEST_ID_PATTERN.test(requestId)) return Promise.reject(new Error('invalid-request-id'))

  return new Promise((resolve, reject) => {
    const parent = target.parent
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (event.source !== parent) return
      const response = readDesktopExternalLinkResponse(event.data, requestId)
      if (response === undefined) return
      cleanup()
      if (response.ok) resolve()
      else reject(new Error(response.error))
    }
    const timeout = target.setTimeout(() => {
      cleanup()
      reject(new Error('desktop-shell-unavailable'))
    }, options.timeoutMs ?? RESPONSE_TIMEOUT_MS)
    const cleanup = (): void => {
      target.clearTimeout(timeout)
      target.removeEventListener('message', onMessage)
    }
    target.addEventListener('message', onMessage)
    parent.postMessage({
      channel: DESKTOP_EXTERNAL_LINK_CHANNEL,
      version: DESKTOP_EXTERNAL_LINK_VERSION,
      type: 'open-request',
      requestId,
      url,
    }, '*')
  })
}

function anchorFromEventTarget(target: EventTarget | null): HTMLAnchorElement | null {
  if (target instanceof Element) return target.closest<HTMLAnchorElement>('a[href]')
  if (target instanceof Node) return target.parentElement?.closest<HTMLAnchorElement>('a[href]') ?? null
  return null
}

function externalUrlFromAnchor(anchor: HTMLAnchorElement | null): string | undefined {
  if (anchor === null
    || anchor.target !== '_blank'
    || !anchor.relList.contains('noopener')
    || anchor.hasAttribute('download')) return undefined
  const href = anchor.getAttribute('href')
  return href === null ? undefined : resolveDesktopExternalHttpUrl(href, window.location.origin)
}

async function copyLinkAddress(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(value)
      return
    }
  }
  catch {
    // A denied asynchronous clipboard write still permits the user-gesture fallback below.
  }
  const field = document.createElement('textarea')
  field.value = value
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  if (!copied) throw new Error('clipboard-unavailable')
}

/** Install click, hover, and context-menu behavior for desktop Markdown links. */
export function installDesktopExternalLinks(ctx: Context, t: Translate): void {
  ctx.effect(() => {
    if (typeof window === 'undefined' || window.parent === window) return () => {}

    const menu = document.createElement('div')
    menu.className = 'dpw-link-menu'
    menu.hidden = true
    menu.setAttribute('role', 'menu')
    const openButton = document.createElement('button')
    openButton.type = 'button'
    openButton.className = 'dpw-link-menu-item'
    openButton.setAttribute('role', 'menuitem')
    const copyButton = document.createElement('button')
    copyButton.type = 'button'
    copyButton.className = 'dpw-link-menu-item'
    copyButton.setAttribute('role', 'menuitem')
    const status = document.createElement('div')
    status.className = 'dpw-link-menu-status'
    status.hidden = true
    menu.append(openButton, copyButton, status)
    document.body.append(menu)

    let selectedUrl: string | undefined
    const markedAnchors = new Set<HTMLAnchorElement>()
    let statusTimer: number | undefined
    const clearStatusTimer = (): void => {
      if (statusTimer !== undefined) window.clearTimeout(statusTimer)
      statusTimer = undefined
    }
    const hideMenu = (): void => {
      clearStatusTimer()
      selectedUrl = undefined
      menu.hidden = true
    }
    const positionMenu = (x: number, y: number): void => {
      menu.style.left = `${Math.max(8, x)}px`
      menu.style.top = `${Math.max(8, y)}px`
      const bounds = menu.getBoundingClientRect()
      menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`
      menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`
    }
    const showStatus = (message: string, x: number, y: number): void => {
      selectedUrl = undefined
      openButton.hidden = true
      copyButton.hidden = true
      status.hidden = false
      status.textContent = message
      menu.hidden = false
      positionMenu(x, y)
      clearStatusTimer()
      statusTimer = window.setTimeout(hideMenu, 2_500)
    }
    const openUrl = (url: string, x: number, y: number): void => {
      void requestDesktopExternalLinkOpen(url).catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error)
        showStatus(`${t('link.error.open')} ${detail}`, x, y)
      })
    }

    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || event.button !== 0) return
      const url = externalUrlFromAnchor(anchorFromEventTarget(event.target))
      if (url === undefined) return
      event.preventDefault()
      hideMenu()
      openUrl(url, event.clientX, event.clientY)
    }
    const onContextMenu = (event: MouseEvent): void => {
      const url = externalUrlFromAnchor(anchorFromEventTarget(event.target))
      if (url === undefined) {
        hideMenu()
        return
      }
      event.preventDefault()
      clearStatusTimer()
      selectedUrl = url
      openButton.hidden = false
      copyButton.hidden = false
      status.hidden = true
      openButton.textContent = t('link.menu.open')
      copyButton.textContent = t('link.menu.copy')
      menu.hidden = false
      positionMenu(event.clientX, event.clientY)
      openButton.focus()
    }
    const onMouseOver = (event: MouseEvent): void => {
      const anchor = anchorFromEventTarget(event.target)
      const url = externalUrlFromAnchor(anchor)
      if (anchor === null || url === undefined) return
      markedAnchors.add(anchor)
      anchor.classList.add('dpw-desktop-external-link')
      if (!anchor.hasAttribute('title')) {
        anchor.title = url
        anchor.dataset.xiaohuiExternalLinkTitle = 'true'
      }
    }
    const onDocumentPointer = (event: Event): void => {
      if (!menu.hidden && event.target instanceof Node && !menu.contains(event.target)) hideMenu()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') hideMenu()
    }
    const onOpen = (): void => {
      const url = selectedUrl
      const bounds = menu.getBoundingClientRect()
      hideMenu()
      if (url !== undefined) openUrl(url, bounds.left, bounds.top)
    }
    const onCopy = (): void => {
      const url = selectedUrl
      const bounds = menu.getBoundingClientRect()
      if (url === undefined) return
      void copyLinkAddress(url).then(
        () => { showStatus(t('link.copy.done'), bounds.left, bounds.top) },
        () => { showStatus(t('link.error.copy'), bounds.left, bounds.top) },
      )
    }

    document.addEventListener('click', onClick)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('pointerdown', onDocumentPointer)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', hideMenu)
    window.addEventListener('resize', hideMenu)
    window.addEventListener('scroll', hideMenu, true)
    openButton.addEventListener('click', onOpen)
    copyButton.addEventListener('click', onCopy)

    return () => {
      hideMenu()
      document.removeEventListener('click', onClick)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('pointerdown', onDocumentPointer)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', hideMenu)
      window.removeEventListener('resize', hideMenu)
      window.removeEventListener('scroll', hideMenu, true)
      openButton.removeEventListener('click', onOpen)
      copyButton.removeEventListener('click', onCopy)
      markedAnchors.forEach((anchor) => {
        anchor.classList.remove('dpw-desktop-external-link')
        if (anchor.dataset.xiaohuiExternalLinkTitle === 'true') {
          anchor.removeAttribute('title')
          delete anchor.dataset.xiaohuiExternalLinkTitle
        }
      })
      menu.remove()
    }
  }, 'personal-workbench: desktop external links')
}
