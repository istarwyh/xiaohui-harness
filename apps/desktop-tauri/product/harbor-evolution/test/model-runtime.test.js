import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CandidateModelRuntime,
  MODEL_GATEWAY_PROTOCOL,
} from '../lib/model-runtime.js'

function runtime(options = {}) {
  const calls = []
  const status = options.status ?? { configured: true }
  const ctx = {
    agentDefaultModel: {
      currentSelection: () => ({
        provider: 'openai-codex',
        model: 'gpt-test',
        reasoningEffort: 'high',
      }),
    },
    llm: {
      listProviders: () => [{ id: 'openai-codex', name: 'Codex' }],
      resolveModelInfo: async (provider, model) => ({
        provider,
        id: model,
        name: 'GPT Test',
        context: { contextWindow: 1000 },
      }),
      async * stream(value) {
        calls.push(value)
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: 'ok' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
    get: name => name === 'codexAuth' ? { status: async () => status } : undefined,
  }
  return {
    calls,
    value: new CandidateModelRuntime(ctx, {
      candidateProvider: '',
      candidateModel: '',
      candidateReasoningEffort: '',
      modelBrokerBindHost: '127.0.0.1',
      modelBrokerAdvertisedHost: '127.0.0.1',
      modelBrokerMaxRequests: 2,
      modelBrokerMaxRequestBytes: 1024 * 1024,
      ...options.config,
    }),
  }
}

test('freezes the current XiaoHui Agent model into a Candidate binding', async () => {
  const { value } = runtime()
  assert.deepEqual(await value.resolve(), {
    provider: 'openai-codex',
    model: 'gpt-test',
    reasoning_effort: 'high',
    transport: 'xiaohui-host-broker',
    protocol: MODEL_GATEWAY_PROTOCOL,
    model_info: {
      provider: 'openai-codex',
      id: 'gpt-test',
      name: 'GPT Test',
      context: { contextWindow: 1000 },
    },
  })
})

test('fails before Harbor starts when GPT Auth is not signed in', async () => {
  const { value } = runtime({ status: { configured: false } })
  await assert.rejects(value.resolve(), /complete GPT Auth in Settings/)
})

test('rejects a half-configured Candidate model route', async () => {
  const { value } = runtime({ config: { candidateProvider: 'openai-codex' } })
  await assert.rejects(value.resolve(), /configuration must be supplied together/)
})

test('proxies one authenticated Candidate stream and forces the frozen route', async () => {
  const { value, calls } = runtime()
  const binding = await value.resolve()
  const lease = await value.openLease(binding, {
    candidateDigest: 'sha256:test',
    jobName: 'job-test',
  })
  try {
    const health = await fetch(lease.endpoint, {
      headers: { authorization: `Bearer ${lease.token}` },
    })
    assert.equal(health.status, 200)
    assert.equal((await health.json()).binding.provider, 'openai-codex')

    const response = await fetch(lease.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${lease.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider: 'attacker', model: 'other', messages: [] }),
    })
    assert.equal(response.status, 200)
    const chunks = (await response.text()).trim().split('\n').map(line => JSON.parse(line))
    assert.equal(chunks.at(-1).type, 'finish')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].provider, 'openai-codex')
    assert.equal(calls[0].model, 'gpt-test')
    assert.equal(calls[0].reasoningEffort, 'high')
  } finally {
    await lease.close()
  }
})

test('does not reveal whether a wrong lease route exists', async () => {
  const { value } = runtime()
  const binding = await value.resolve()
  const lease = await value.openLease(binding, {
    candidateDigest: 'sha256:test',
    jobName: 'job-test',
  })
  try {
    const wrongRoute = await fetch(`${lease.endpoint}-wrong`, {
      headers: { authorization: `Bearer ${lease.token}` },
    })
    assert.equal(wrongRoute.status, 404)
    const wrongCapability = await fetch(lease.endpoint, {
      headers: { authorization: 'Bearer wrong' },
    })
    assert.equal(wrongCapability.status, 404)
  } finally {
    await lease.close()
  }
})
