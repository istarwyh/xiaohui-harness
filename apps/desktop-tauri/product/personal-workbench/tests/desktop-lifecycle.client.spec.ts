import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_LIFECYCLE_CHANNEL,
  DESKTOP_LIFECYCLE_VERSION,
  isDesktopLifecycleAvailable,
  readDesktopLifecycleResponse,
  requestDesktopRestart,
  requestDesktopUpdate,
  type DesktopLifecycleAction,
} from '../src/client/desktop-lifecycle.ts'

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

function response(
  action: DesktopLifecycleAction,
  requestId: string,
  fields: { ok: true, message: string } | { ok: false, error: string },
) {
  return {
    channel: DESKTOP_LIFECYCLE_CHANNEL,
    version: DESKTOP_LIFECYCLE_VERSION,
    type: `${action}-response`,
    requestId,
    ...fields,
  }
}

function accepted(action: DesktopLifecycleAction, requestId: string) {
  return {
    channel: DESKTOP_LIFECYCLE_CHANNEL,
    version: DESKTOP_LIFECYCLE_VERSION,
    type: `${action}-accepted`,
    requestId,
  }
}

describe('desktop lifecycle browser bridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is available only inside a distinct parent window', () => {
    const embedded = new FakeWindow()
    expect(isDesktopLifecycleAvailable(embedded as unknown as Window)).toBe(true)
    const standalone = {} as Window
    Object.defineProperty(standalone, 'parent', { value: standalone })
    expect(isDesktopLifecycleAvailable(standalone)).toBe(false)
  })

  it('accepts only correlated fields for the requested action', () => {
    expect(readDesktopLifecycleResponse(
      response('check-update', 'request_1', { ok: true, message: 'current' }),
      'request_1',
      'check-update',
    )).toMatchObject({ ok: true, message: 'current' })
    expect(readDesktopLifecycleResponse(
      accepted('restart', 'request_1'),
      'request_1',
      'restart',
    )).toMatchObject({ type: 'restart-accepted' })
    expect(readDesktopLifecycleResponse(
      accepted('restart', 'request_1'),
      'request_1',
      'check-update',
    )).toBeUndefined()
    expect(readDesktopLifecycleResponse({
      ...response('check-update', 'request_1', { ok: true, message: 'current' }),
      command: 'restart_app',
    }, 'request_1', 'check-update')).toBeUndefined()
  })

  it('posts the fixed update request and ignores the wrong source and request id', async () => {
    const target = new FakeWindow()
    const result = requestDesktopUpdate({
      target: target as unknown as Window,
      requestId: 'request_1',
      handshakeTimeoutMs: 1_000,
    })
    expect(target.parent.messages).toEqual([{
      message: {
        channel: DESKTOP_LIFECYCLE_CHANNEL,
        version: DESKTOP_LIFECYCLE_VERSION,
        type: 'check-update-request',
        requestId: 'request_1',
      },
      targetOrigin: '*',
    }])

    target.emit(response('check-update', 'request_1', { ok: true, message: 'wrong source' }), {})
    target.emit(response('check-update', 'request_2', { ok: true, message: 'wrong id' }))
    expect(target.listeners.size).toBe(1)
    target.emit(accepted('check-update', 'request_1'))
    target.emit(response('check-update', 'request_1', { ok: true, message: 'current version' }))
    await expect(result).resolves.toBe('current version')
    expect(target.listeners.size).toBe(0)
  })

  it('posts the fixed restart request and surfaces a native failure', async () => {
    const target = new FakeWindow()
    const result = requestDesktopRestart({
      target: target as unknown as Window,
      requestId: 'restart_1',
      handshakeTimeoutMs: 1_000,
    })
    expect(target.parent.messages[0]).toEqual({
      message: {
        channel: DESKTOP_LIFECYCLE_CHANNEL,
        version: DESKTOP_LIFECYCLE_VERSION,
        type: 'restart-request',
        requestId: 'restart_1',
      },
      targetOrigin: '*',
    })
    target.emit(accepted('restart', 'restart_1'))
    target.emit(response('restart', 'restart_1', { ok: false, error: 'restart unavailable' }))
    await expect(result).rejects.toThrow('restart unavailable')
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
    target.emit(accepted('check-update', request.requestId ?? ''))
    target.emit(response('check-update', request.requestId ?? '', { ok: true, message: 'current version' }))
    await expect(result).resolves.toBe('current version')
  })

  it('times out only while waiting for the Shell to accept the request', async () => {
    const target = new FakeWindow()
    const result = requestDesktopRestart({
      target: target as unknown as Window,
      requestId: 'restart_1',
      handshakeTimeoutMs: 1,
    })
    await expect(result).rejects.toThrow('desktop-shell-unavailable')
    expect(target.listeners.size).toBe(0)
  })

  it('keeps waiting for a restart after the Shell accepts the request', async () => {
    const target = new FakeWindow()
    const result = requestDesktopRestart({
      target: target as unknown as Window,
      requestId: 'restart_1',
      handshakeTimeoutMs: 5,
    })
    target.emit(accepted('restart', 'restart_1'))
    await new Promise(resolve => { setTimeout(resolve, 20) })
    target.emit(response('restart', 'restart_1', { ok: false, error: 'synthetic stop' }))
    await expect(result).rejects.toThrow('synthetic stop')
  })

  it('does not accept a handshake from the wrong source, request, or action', async () => {
    const target = new FakeWindow()
    const result = requestDesktopUpdate({
      target: target as unknown as Window,
      requestId: 'request_1',
      handshakeTimeoutMs: 5,
    })
    target.emit(accepted('check-update', 'request_1'), {})
    target.emit(accepted('check-update', 'request_2'))
    target.emit(accepted('restart', 'request_1'))
    await expect(result).rejects.toThrow('desktop-shell-unavailable')
  })
})
