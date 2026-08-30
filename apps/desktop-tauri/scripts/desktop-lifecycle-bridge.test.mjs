import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const shell = readFileSync(join(desktopRoot, 'shell.html'), 'utf8')
const validatorSource = shell.match(
  /function readDesktopLifecycleAction\(value\) \{[\s\S]*?\n    \}\n\n    window\.addEventListener/u,
)?.[0].replace(/\n\n    window\.addEventListener$/u, '')

if (validatorSource === undefined) throw new Error('desktop bridge request validators are missing')
const validators = Function(
  'desktopLifecycleChannel',
  'desktopLifecycleVersion',
  'desktopLifecycleRequestId',
  'networkProxyChannel',
  'networkProxyVersion',
  'marketplaceLinkChannel',
  'marketplaceLinkVersion',
  `${validatorSource}; return { readDesktopLifecycleAction, readNetworkProxyAction, isMarketplaceLinkRequest }`,
)('xiaohui.desktop.lifecycle', 1, /^[A-Za-z0-9_-]{1,64}$/, 'xiaohui.desktop.network-proxy', 1, 'xiaohui.desktop.marketplace-link', 1)

test('desktop shell accepts only fixed lifecycle request fields and actions', () => {
  const request = {
    channel: 'xiaohui.desktop.lifecycle',
    version: 1,
    type: 'check-update-request',
    requestId: 'request_1',
  }
  assert.equal(validators.readDesktopLifecycleAction(request), 'check-update')
  assert.equal(validators.readDesktopLifecycleAction({ ...request, type: 'restart-request' }), 'restart')
  assert.equal(validators.readDesktopLifecycleAction({ ...request, url: 'https://untrusted.example/update.json' }), false)
  assert.equal(validators.readDesktopLifecycleAction({ ...request, version: 2 }), false)
  assert.equal(validators.readDesktopLifecycleAction({ ...request, type: 'quit-request' }), false)
  assert.equal(validators.readDesktopLifecycleAction({ ...request, requestId: 'a'.repeat(65) }), false)
})

test('desktop shell accepts only restricted Marketplace repository and npm links', () => {
  const request = {
    channel: 'xiaohui.desktop.marketplace-link',
    version: 1,
    type: 'open-request',
    requestId: 'link_1',
    url: 'https://github.com/volcengine/OpenViking',
  }
  for (const url of [
    'https://github.com/volcengine/OpenViking',
    'https://www.npmjs.com/search?q=OpenViking',
    'https://www.npmjs.com/package/@openviking/dsh-memory-plugin',
  ]) {
    assert.equal(validators.isMarketplaceLinkRequest({ ...request, url }), true, url)
  }
  for (const url of [
    'http://github.com/volcengine/OpenViking',
    'https://github.com/volcengine/OpenViking/issues',
    'https://github.com.evil.example/volcengine/OpenViking',
    'https://www.npmjs.com/settings/profile',
  ]) {
    assert.equal(validators.isMarketplaceLinkRequest({ ...request, url }), false, url)
  }
  assert.equal(validators.isMarketplaceLinkRequest({ ...request, extra: true }), false)
})

test('desktop shell accepts only fixed network proxy requests and bounded settings', () => {
  const settings = {
    mode: 'custom',
    httpProxy: 'http://127.0.0.1:7890',
    httpsProxy: 'http://127.0.0.1:7890',
    noProxy: 'localhost,127.0.0.1',
  }
  const request = {
    channel: 'xiaohui.desktop.network-proxy',
    version: 1,
    type: 'test-request',
    requestId: 'proxy_1',
    settings,
  }
  assert.equal(validators.readNetworkProxyAction(request), 'test')
  assert.equal(validators.readNetworkProxyAction({ ...request, type: 'save-request' }), 'save')
  assert.equal(validators.readNetworkProxyAction({
    channel: request.channel,
    version: 1,
    type: 'get-request',
    requestId: request.requestId,
  }), 'get')
  assert.equal(validators.readNetworkProxyAction({ ...request, command: 'restart_app' }), false)
  assert.equal(validators.readNetworkProxyAction({ ...request, settings: { ...settings, token: 'secret' } }), false)
  assert.equal(validators.readNetworkProxyAction({ ...request, settings: { ...settings, mode: 'ambient' } }), false)
  assert.equal(validators.readNetworkProxyAction({ ...request, settings: { ...settings, noProxy: 'x'.repeat(4097) } }), false)
})

test('desktop shell binds lifecycle commands to the active Host iframe', () => {
  assert.match(shell, /event\.source !== embeddedWindow \|\| event\.origin !== embeddedOrigin/u)
  assert.match(shell, /type: `\$\{lifecycleAction\}-accepted`/u)
  assert.match(shell, /await invoke\('check_for_updates'\)/u)
  assert.match(shell, /await invoke\('restart_app'\)/u)
  assert.match(shell, /await invoke\('get_network_proxy_settings'\)/u)
  assert.match(shell, /await invoke\('test_network_proxy_settings', \{ settings: event\.data\.settings \}\)/u)
  assert.match(shell, /await invoke\('save_network_proxy_settings', \{ settings: event\.data\.settings \}\)/u)
  assert.match(shell, /await invoke\('open_marketplace_url', \{ url: event\.data\.url \}\)/u)
  assert.match(shell, /embeddedWindow\.postMessage\(response, embeddedOrigin\)/u)
  assert.doesNotMatch(shell, /invoke\(event\.data/u)
  assert.doesNotMatch(shell, /embeddedWindow\.postMessage\(response, ['"]\*['"]\)/u)
  assert.ok(shell.indexOf('type: `${lifecycleAction}-accepted`') < shell.indexOf("await invoke('check_for_updates')"))
})
