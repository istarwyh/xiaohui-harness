import { readFile } from 'node:fs/promises'

export const name = 'harbor-model-gateway'
export const inject = ['llm']

const MAX_ERROR_BYTES = 65536
const MAX_CHUNK_LINE_BYTES = 33554432

async function boundedText(response) {
  const text = await response.text()
  return text.length <= MAX_ERROR_BYTES ? text : `${text.slice(0, MAX_ERROR_BYTES)}…`
}

function translatedModelInfo(value, provider, model) {
  if (value === null || typeof value !== 'object' || value.id !== model) {
    throw new Error('harbor-model-gateway: invalid model metadata')
  }
  return {
    ...value,
    provider,
    id: model,
    name: typeof value.name === 'string' && value.name ? value.name : model,
  }
}

class GatewayAdapter {
  constructor(config, token, modelInfo) {
    this.config = config
    this.token = token
    this.modelInfo = modelInfo
  }

  providerInfo(provider) {
    return { id: provider, name: 'XiaoHui Host Model' }
  }

  providerRetryPolicy() {
    return undefined
  }

  listModels(provider) {
    return Promise.resolve([{ ...this.modelInfo, provider }])
  }

  resolveModel(provider, model) {
    if (provider !== this.config.provider || model !== this.config.model) {
      return Promise.reject(new Error(`harbor-model-gateway: lease does not allow ${provider}/${model}`))
    }
    return Promise.resolve({ ...this.modelInfo, provider, id: model })
  }

  async * stream(options) {
    if (options.provider !== this.config.provider || options.model !== this.config.model) {
      throw new Error(`harbor-model-gateway: lease does not allow ${options.provider}/${options.model}`)
    }
    const { signal, ...body } = options
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      throw new Error(`harbor-model-gateway: Host returned ${response.status}: ${await boundedText(response)}`)
    }
    if (response.body === null) throw new Error('harbor-model-gateway: Host returned no stream body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    let finished = false
    try {
      while (true) {
        const next = await reader.read()
        pending += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done })
        if (Buffer.byteLength(pending) > MAX_CHUNK_LINE_BYTES) {
          throw new Error('harbor-model-gateway: Host emitted an oversized stream line')
        }
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const chunk = JSON.parse(line)
          if (chunk.type === 'finish') finished = true
          yield chunk
        }
        if (next.done) break
      }
      if (pending.trim()) {
        const chunk = JSON.parse(pending)
        if (chunk.type === 'finish') finished = true
        yield chunk
      }
      if (!finished) throw new Error('harbor-model-gateway: Host stream ended before a terminal finish')
    } finally {
      reader.releaseLock()
    }
  }
}

export async function apply(ctx, config) {
  const token = (await readFile(config.tokenFile, 'utf8')).trim()
  if (!token) throw new Error('harbor-model-gateway: the Job lease token is empty')
  const modelInfo = translatedModelInfo(JSON.parse(config.modelInfoJson), config.provider, config.model)
  ctx.llm.registerAdapter([config.provider], new GatewayAdapter(config, token, modelInfo))
}
