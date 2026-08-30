import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  PRODUCT_CLIENT_IDS,
  assertCleanChildExit,
  assertProductClientBoot,
  createReleaseChildEnvironment,
  stopChild,
} from './verify-product-release.mjs'

class FakeChild extends EventEmitter {
  exitCode = null
  signalCode = null
  signals = []

  constructor(onSignal) {
    super()
    this.onSignal = onSignal
  }

  kill(signal) {
    this.signals.push(signal)
    this.onSignal(this, signal)
    return true
  }

  close(code, signal) {
    this.exitCode = code
    this.signalCode = signal
    setImmediate(() => { this.emit('close', code, signal) })
  }
}

test('release candidate children receive only an isolated allowlisted environment', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-release-env-test-'))
  try {
    const environment = createReleaseChildEnvironment(root, '/product-runtime', {
      PATH: '/credential-wrapper/bin',
      HOME: '/real-home',
      LANG: 'en_US.UTF-8',
      GH_TOKEN: 'gh-secret',
      OPENAI_API_KEY: 'openai-secret',
      AWS_ACCESS_KEY_ID: 'aws-id',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
      DSH_HOME: '/real-dsh',
      NODE_OPTIONS: '--require=/secret.js',
      SSH_AUTH_SOCK: '/real-agent.sock',
      UNRELATED_AMBIENT_VALUE: 'do-not-forward',
    })

    assert.equal(environment.LANG, 'en_US.UTF-8')
    assert.equal(environment.HOME, join(root, 'home'))
    assert.equal(environment.USERPROFILE, join(root, 'home'))
    assert.equal(environment.DSH_HOME, join(root, 'dsh-home'))
    assert.equal(environment.DSH_AGENTS_HOME, join(root, 'agents'))
    assert.equal(environment.DEEPSEEK_API_KEY, 'xiaohui-release-smoke-no-model-call')
    assert.ok(environment.PATH.includes('/product-runtime/venv/bin'))
    assert.ok(!environment.PATH.includes('/credential-wrapper/bin'))
    for (const name of [
      'GH_TOKEN',
      'OPENAI_API_KEY',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'NODE_OPTIONS',
      'SSH_AUTH_SOCK',
      'UNRELATED_AMBIENT_VALUE',
    ]) {
      assert.equal(environment[name], undefined, `${name} must not be inherited`)
    }
    for (const name of ['HOME', 'TMPDIR', 'XDG_CONFIG_HOME', 'DSH_HOME', 'DSH_AGENTS_HOME']) {
      assert.equal(existsSync(environment[name]), true, `${name} must exist`)
    }
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Host teardown accepts only a normal code-zero exit', () => {
  assert.doesNotThrow(() => assertCleanChildExit({ code: 0, signal: null, timedOut: false, forced: false }))
  assert.throws(
    () => assertCleanChildExit({ code: null, signal: 'SIGTERM', timedOut: false, forced: false }),
    /signal=SIGTERM/,
  )
  assert.throws(
    () => assertCleanChildExit({ code: null, signal: 'SIGKILL', timedOut: true, forced: true }),
    /timedOut=true/,
  )
})

test('Host teardown preserves a graceful code-zero close', async () => {
  const child = new FakeChild((target, signal) => {
    if (signal === 'SIGTERM') target.close(0, null)
  })
  assert.deepEqual(await stopChild(child, {
    gracefulMilliseconds: 50,
    forcedMilliseconds: 50,
  }), {
    code: 0,
    signal: null,
    timedOut: false,
    forced: false,
  })
  assert.deepEqual(child.signals, ['SIGTERM'])
})

test('Host teardown records timeout and SIGKILL independently', async () => {
  const child = new FakeChild((target, signal) => {
    if (signal === 'SIGKILL') target.close(null, 'SIGKILL')
  })
  const outcome = await stopChild(child, {
    gracefulMilliseconds: 5,
    forcedMilliseconds: 50,
  })
  assert.deepEqual(outcome, {
    code: null,
    signal: 'SIGKILL',
    timedOut: true,
    forced: true,
  })
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL'])
  assert.throws(() => assertCleanChildExit(outcome), /forced=true/)
})

test('assembled Client boot requires every product response, mounted UI, and quiet runtime', () => {
  const clientResponses = Object.fromEntries(PRODUCT_CLIENT_IDS.map(id => [id, 200]))
  const clean = {
    clientResponses,
    pageErrors: [],
    consoleErrors: [],
    bootFailureCount: 0,
    frameCount: 1,
  }
  assert.doesNotThrow(() => assertProductClientBoot(clean))
  assert.throws(
    () => assertProductClientBoot({
      ...clean,
      clientResponses: { ...clientResponses, 'dsh-context-doctor': 500 },
      pageErrors: ['ReferenceError: missing runtime'],
      consoleErrors: ['plugin activation failed'],
    }),
    /dsh-context-doctor Client bundle returned HTTP 500[\s\S]*pageerror:[\s\S]*console error:/,
  )
  const missing = { ...clientResponses }
  delete missing['dsh-harbor-evolution']
  assert.throws(
    () => assertProductClientBoot({ ...clean, clientResponses: missing, frameCount: 0 }),
    /assembled Web application frame never mounted[\s\S]*dsh-harbor-evolution Client bundle was not requested/,
  )
})
