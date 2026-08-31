import { describe, expect, it } from 'vitest'
import {
  DESKTOP_NETWORK_PROXY_CHANNEL,
  DESKTOP_NETWORK_PROXY_VERSION,
  readDesktopNetworkProxyResponse,
  readNetworkProxySettings,
  requestDesktopNetworkProxySave,
  requestDesktopNetworkProxySnapshot,
  requestDesktopNetworkProxyTest,
  type NetworkProxySettings,
} from '../src/client/desktop-network-proxy.ts'
import { requestHostNetworkProxyTest } from '../src/client/host-network-proxy.ts'

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

const settings: NetworkProxySettings = {
  mode: 'custom',
  httpProxy: 'http://127.0.0.1:7890',
  httpsProxy: 'http://127.0.0.1:7890',
  noProxy: '*.local',
}

const snapshot = {
  settings,
  system: {
    supported: true,
    configured: true,
    httpProxy: 'http://127.0.0.1:7890',
    httpsProxy: 'http://127.0.0.1:7890',
    noProxy: 'localhost,127.0.0.1,::1,*.local',
    autoConfigUrl: '',
    error: '',
  },
  effective: settings,
  effectiveError: '',
}

function accepted(action: 'get' | 'test' | 'save', requestId: string) {
  return {
    channel: DESKTOP_NETWORK_PROXY_CHANNEL,
    version: DESKTOP_NETWORK_PROXY_VERSION,
    type: `${action}-accepted`,
    requestId,
  }
}

function response(action: 'get' | 'test' | 'save', requestId: string, value: unknown) {
  return {
    channel: DESKTOP_NETWORK_PROXY_CHANNEL,
    version: DESKTOP_NETWORK_PROXY_VERSION,
    type: `${action}-response`,
    requestId,
    ok: true,
    value,
  }
}

describe('desktop network proxy browser bridge', () => {
  it('validates the complete bounded settings object', () => {
    expect(readNetworkProxySettings(settings)).toEqual(settings)
    expect(readNetworkProxySettings({ ...settings, token: 'secret' })).toBeUndefined()
    expect(readNetworkProxySettings({ ...settings, mode: 'ambient' })).toBeUndefined()
    expect(readNetworkProxySettings({ ...settings, noProxy: 'x'.repeat(4097) })).toBeUndefined()
  })

  it('loads a correlated desktop snapshot', async () => {
    const target = new FakeWindow()
    const result = requestDesktopNetworkProxySnapshot({
      target: target as unknown as Window,
      requestId: 'proxy_get_1',
      handshakeTimeoutMs: 1_000,
    })
    expect(target.parent.messages[0]).toEqual({
      message: {
        channel: DESKTOP_NETWORK_PROXY_CHANNEL,
        version: DESKTOP_NETWORK_PROXY_VERSION,
        type: 'get-request',
        requestId: 'proxy_get_1',
      },
      targetOrigin: '*',
    })
    target.emit(accepted('get', 'proxy_get_1'))
    target.emit(response('get', 'proxy_get_1', snapshot))
    await expect(result).resolves.toEqual(snapshot)
    expect(target.listeners.size).toBe(0)
  })

  it('tests and saves only the fixed settings payload', async () => {
    const target = new FakeWindow()
    const testResult = requestDesktopNetworkProxyTest(settings, {
      target: target as unknown as Window,
      requestId: 'proxy_test_1',
      handshakeTimeoutMs: 1_000,
    })
    expect(target.parent.messages[0]?.message).toMatchObject({
      type: 'test-request',
      settings,
    })
    target.emit(accepted('test', 'proxy_test_1'))
    target.emit(response('test', 'proxy_test_1', { status: 200, proxied: true }))
    await expect(testResult).resolves.toEqual({ status: 200, proxied: true })

    const saved = requestDesktopNetworkProxySave(settings, {
      target: target as unknown as Window,
      requestId: 'proxy_save_1',
      handshakeTimeoutMs: 1_000,
    })
    target.emit(accepted('save', 'proxy_save_1'))
    target.emit(response('save', 'proxy_save_1', snapshot))
    await expect(saved).resolves.toEqual(snapshot)
  })

  it('ignores malformed success values and the wrong parent source', async () => {
    const target = new FakeWindow()
    const result = requestDesktopNetworkProxyTest(settings, {
      target: target as unknown as Window,
      requestId: 'proxy_test_1',
      handshakeTimeoutMs: 20,
    })
    target.emit(accepted('test', 'proxy_test_1'), {})
    target.emit(response('test', 'proxy_test_1', { status: 999, proxied: true }))
    await expect(result).rejects.toThrow('desktop-shell-unavailable')
  })

  it('accepts only a response with the action-specific value', () => {
    expect(readDesktopNetworkProxyResponse(
      response('test', 'proxy_1', { status: 204, proxied: true }),
      'proxy_1',
      'test',
    )).toMatchObject({ ok: true })
    expect(readDesktopNetworkProxyResponse(
      response('test', 'proxy_1', snapshot),
      'proxy_1',
      'test',
    )).toBeUndefined()
  })
})

describe('Node Host network proxy diagnostic client', () => {
  it('sends only the fixed same-origin JSON POST and validates its result', async () => {
    const calls: Array<{ input: string, init: RequestInit }> = []
    const result = await requestHostNetworkProxyTest(async (input, init) => {
      calls.push({ input, init })
      return {
        json: async () => ({ ok: true, status: 200, proxied: true, errorCode: '' }),
      }
    })
    expect(calls).toEqual([{
      input: '/api/xiaohui/network-proxy/test',
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    }])
    expect(result).toEqual({ ok: true, status: 200, proxied: true, errorCode: '' })
  })

  it('rejects extra fields and unbounded transport details', async () => {
    await expect(requestHostNetworkProxyTest(async () => ({
      json: async () => ({
        ok: false,
        status: 0,
        proxied: true,
        errorCode: 'UND_ERR_CONNECT_TIMEOUT',
        proxyUrl: 'http://secret@127.0.0.1:7890',
      }),
    }))).rejects.toThrow('host-network-proxy-response-invalid')
    await expect(requestHostNetworkProxyTest(async () => ({
      json: async () => ({ ok: false, status: 0, proxied: true, errorCode: 'x'.repeat(65) }),
    }))).rejects.toThrow('host-network-proxy-response-invalid')
  })
})
