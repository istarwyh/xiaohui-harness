import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_UPDATE_CHANNEL,
  DESKTOP_UPDATE_VERSION,
  isDesktopUpdateAvailable,
  readDesktopUpdateResponse,
  requestDesktopUpdate,
} from '../src/client/desktop-update.ts'

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

function response(requestId: string, fields: { ok: true, message: string } | { ok: false, error: string }) {
  return {
    channel: DESKTOP_UPDATE_CHANNEL,
    version: DESKTOP_UPDATE_VERSION,
    type: 'check-response',
    requestId,
    ...fields,
  }
}

function accepted(requestId: string) {
  return {
    channel: DESKTOP_UPDATE_CHANNEL,
    version: DESKTOP_UPDATE_VERSION,
    type: 'check-accepted',
    requestId,
  }
}

describe('desktop update browser bridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is available only inside a distinct parent window', () => {
    const embedded = new FakeWindow()
    expect(isDesktopUpdateAvailable(embedded as unknown as Window)).toBe(true)
    const standalone = {} as Window
    Object.defineProperty(standalone, 'parent', { value: standalone })
    expect(isDesktopUpdateAvailable(standalone)).toBe(false)
  })

  it('accepts only the correlated fixed response fields', () => {
    expect(readDesktopUpdateResponse(response('request_1', { ok: true, message: 'current' }), 'request_1'))
      .toMatchObject({ ok: true, message: 'current' })
    expect(readDesktopUpdateResponse(accepted('request_1'), 'request_1'))
      .toMatchObject({ type: 'check-accepted' })
    expect(readDesktopUpdateResponse(response('wrong', { ok: true, message: 'current' }), 'request_1'))
      .toBeUndefined()
    expect(readDesktopUpdateResponse({
      ...response('request_1', { ok: true, message: 'current' }),
      command: 'restart_app',
    }, 'request_1')).toBeUndefined()
  })

  it('posts one fixed request and ignores the wrong source and request id', async () => {
    const target = new FakeWindow()
    const result = requestDesktopUpdate({
      target: target as unknown as Window,
      requestId: 'request_1',
      handshakeTimeoutMs: 1_000,
    })
    expect(target.parent.messages).toEqual([{
      message: {
        channel: DESKTOP_UPDATE_CHANNEL,
        version: DESKTOP_UPDATE_VERSION,
        type: 'check-request',
        requestId: 'request_1',
      },
      targetOrigin: '*',
    }])

    target.emit(response('request_1', { ok: true, message: 'wrong source' }), {})
    target.emit(response('request_2', { ok: true, message: 'wrong id' }))
    expect(target.listeners.size).toBe(1)
    target.emit(accepted('request_1'))
    expect(target.listeners.size).toBe(1)
    target.emit(response('request_1', { ok: true, message: 'current version' }))
    await expect(result).resolves.toBe('current version')
    expect(target.listeners.size).toBe(0)
  })

  it('creates a request id without requiring crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint8Array) => {
        values.fill(0xab)
        return values
      },
    })
    const target = new FakeWindow()
    const result = requestDesktopUpdate({
      target: target as unknown as Window,
      handshakeTimeoutMs: 1_000,
    })
    const request = target.parent.messages[0]?.message as { requestId?: string }
    expect(request.requestId).toBe('ab'.repeat(16))
    target.emit(accepted(request.requestId ?? ''))
    target.emit(response(request.requestId ?? '', { ok: true, message: 'current version' }))
    await expect(result).resolves.toBe('current version')
  })

  it('surfaces a correlated native error and removes the listener', async () => {
    const target = new FakeWindow()
    const result = requestDesktopUpdate({
      target: target as unknown as Window,
      requestId: 'request_1',
      handshakeTimeoutMs: 1_000,
    })
    target.emit(response('request_1', { ok: false, error: 'network unavailable' }))
    await expect(result).rejects.toThrow('network unavailable')
    expect(target.listeners.size).toBe(0)
  })

  it('times out only while waiting for the Shell to accept the request', async () => {
    const target = new FakeWindow()
    const result = requestDesktopUpdate({
      target: target as unknown as Window,
      requestId: 'request_1',
      handshakeTimeoutMs: 1,
    })
    await expect(result).rejects.toThrow('desktop-update-shell-unavailable')
    expect(target.listeners.size).toBe(0)
  })

  it('keeps waiting for the native result after the Shell accepts the request', async () => {
    const target = new FakeWindow()
    const result = requestDesktopUpdate({
      target: target as unknown as Window,
      requestId: 'request_1',
      handshakeTimeoutMs: 5,
    })
    target.emit(accepted('request_1'))
    await new Promise(resolve => { setTimeout(resolve, 20) })
    target.emit(response('request_1', { ok: true, message: 'installed' }))
    await expect(result).resolves.toBe('installed')
  })

  it('does not accept a handshake from the wrong source or request', async () => {
    const target = new FakeWindow()
    const result = requestDesktopUpdate({
      target: target as unknown as Window,
      requestId: 'request_1',
      handshakeTimeoutMs: 5,
    })
    target.emit(accepted('request_1'), {})
    target.emit(accepted('request_2'))
    await expect(result).rejects.toThrow('desktop-update-shell-unavailable')
  })
})
