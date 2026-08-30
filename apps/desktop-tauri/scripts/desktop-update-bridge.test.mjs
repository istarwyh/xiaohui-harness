import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const shell = readFileSync(join(desktopRoot, 'shell.html'), 'utf8')
const validatorSource = shell.match(
  /function isDesktopUpdateRequest\(value\) \{[\s\S]*?\n    \}\n\n    window\.addEventListener/u,
)?.[0].replace(/\n\n    window\.addEventListener$/u, '')

if (validatorSource === undefined) throw new Error('desktop update request validator is missing')
const validate = Function(
  'desktopUpdateChannel',
  'desktopUpdateVersion',
  'desktopUpdateRequestId',
  'value',
  `return (${validatorSource})(value)`,
).bind(undefined, 'xiaohui.desktop.update', 1, /^[A-Za-z0-9_-]{1,64}$/)

test('desktop shell accepts only the fixed update request fields', () => {
  const request = {
    channel: 'xiaohui.desktop.update',
    version: 1,
    type: 'check-request',
    requestId: 'request_1',
  }
  assert.equal(validate(request), true)
  assert.equal(validate({ ...request, url: 'https://untrusted.example/update.json' }), false)
  assert.equal(validate({ ...request, version: 2 }), false)
  assert.equal(validate({ ...request, type: 'restart-app' }), false)
  assert.equal(validate({ ...request, requestId: 'a'.repeat(65) }), false)
})

test('desktop shell binds the update command to the active Host iframe', () => {
  assert.match(shell, /event\.source !== embeddedWindow \|\| event\.origin !== embeddedOrigin/u)
  assert.match(shell, /type: 'check-accepted'/u)
  assert.match(shell, /await invoke\('check_for_updates'\)/u)
  assert.match(shell, /embeddedWindow\.postMessage\(response, embeddedOrigin\)/u)
  assert.doesNotMatch(shell, /invoke\(event\.data/u)
  assert.doesNotMatch(shell, /embeddedWindow\.postMessage\(response, ['"]\*['"]\)/u)
  assert.ok(shell.indexOf("type: 'check-accepted'") < shell.indexOf("await invoke('check_for_updates')"))
})
