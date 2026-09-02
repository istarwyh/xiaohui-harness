import { describe, expect, it } from 'vitest'
import {
  DESKTOP_EXTERNAL_LINK_CHANNEL,
  DESKTOP_EXTERNAL_LINK_VERSION,
  readDesktopExternalLinkResponse,
  requestDesktopExternalLinkOpen,
  resolveDesktopExternalHttpUrl,
} from '../src/client/desktop-external-links.ts'

class FakeParent {
  readonly messages: Array<{ message: unknown, targetOrigin: string }> = []

  postMessage(message: unknown, targetOrigin: string): void {
    this.messages.push({ message, targetOrigin })
  }
}

class FakeWindow {
  readonly parent = new FakeParent()
  readonly listeners = new Set<(event: MessageEvent<unknown>) => void>()

  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') this.listeners.add(listener)
  }

  removeEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    if (type === 'message') this.listeners.delete(listener)
  }

  setTimeout(handler: () => void, milliseconds: number): ReturnType<typeof setTimeout> {
    return setTimeout(handler, milliseconds)
  }

  clearTimeout(timeout: ReturnType<typeof setTimeout>): void {
    clearTimeout(timeout)
  }

  emit(data: unknown, source: unknown = this.parent): void {
    for (const listener of this.listeners) listener({ data, source } as MessageEvent<unknown>)
  }
}

function response(requestId: string, fields: { ok: true } | { ok: false, error: string }) {
  return {
    channel: DESKTOP_EXTERNAL_LINK_CHANNEL,
    version: DESKTOP_EXTERNAL_LINK_VERSION,
    type: 'open-response',
    requestId,
    ...fields,
  }
}

describe('desktop external-link browser bridge', () => {
  it('accepts only external credential-free HTTP and HTTPS URLs', () => {
    expect(resolveDesktopExternalHttpUrl(
      'https://github.com/gitroomhq/postiz-app',
      'http://127.0.0.1:3080',
    )).toBe('https://github.com/gitroomhq/postiz-app')
    expect(resolveDesktopExternalHttpUrl(
      'http://example.com:8080/docs?q=x#part',
      'http://127.0.0.1:3080',
    )).toBe('http://example.com:8080/docs?q=x#part')

    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,hello',
      'mailto:user@example.com',
      'https://user@example.com/private',
      '/internal/route',
      'http://127.0.0.1:3080/settings',
    ]) {
      expect(resolveDesktopExternalHttpUrl(url, 'http://127.0.0.1:3080')).toBeUndefined()
    }
  })

  it('accepts only a correlated response with exact fields', () => {
    expect(readDesktopExternalLinkResponse(response('request_1', { ok: true }), 'request_1'))
      .toMatchObject({ ok: true })
    expect(readDesktopExternalLinkResponse(response('request_2', { ok: true }), 'request_1'))
      .toBeUndefined()
    expect(readDesktopExternalLinkResponse({
      ...response('request_1', { ok: true }),
      command: 'open_file',
    }, 'request_1')).toBeUndefined()
    expect(readDesktopExternalLinkResponse(response(
      'request_1',
      { ok: false, error: 'opener unavailable' },
    ), 'request_1')).toMatchObject({ ok: false, error: 'opener unavailable' })
  })

  it('posts a fixed open request and ignores unrelated messages', async () => {
    const target = new FakeWindow()
    const result = requestDesktopExternalLinkOpen('https://example.com/docs', {
      target: target as unknown as Window,
      requestId: 'request_1',
      timeoutMs: 1_000,
    })
    expect(target.parent.messages).toEqual([{
      message: {
        channel: DESKTOP_EXTERNAL_LINK_CHANNEL,
        version: DESKTOP_EXTERNAL_LINK_VERSION,
        type: 'open-request',
        requestId: 'request_1',
        url: 'https://example.com/docs',
      },
      targetOrigin: '*',
    }])
    target.emit(response('request_1', { ok: true }), {})
    target.emit(response('request_2', { ok: true }))
    expect(target.listeners.size).toBe(1)
    target.emit(response('request_1', { ok: true }))
    await expect(result).resolves.toBeUndefined()
    expect(target.listeners.size).toBe(0)
  })

  it('surfaces native failures and an unavailable shell', async () => {
    const failedTarget = new FakeWindow()
    const failed = requestDesktopExternalLinkOpen('https://example.com', {
      target: failedTarget as unknown as Window,
      requestId: 'request_1',
      timeoutMs: 1_000,
    })
    failedTarget.emit(response('request_1', { ok: false, error: 'opener unavailable' }))
    await expect(failed).rejects.toThrow('opener unavailable')

    const timeoutTarget = new FakeWindow()
    await expect(requestDesktopExternalLinkOpen('https://example.com', {
      target: timeoutTarget as unknown as Window,
      requestId: 'request_2',
      timeoutMs: 1,
    })).rejects.toThrow('desktop-shell-unavailable')
  })
})
