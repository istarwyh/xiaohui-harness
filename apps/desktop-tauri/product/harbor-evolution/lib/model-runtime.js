import { randomBytes, timingSafeEqual } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'

export const MODEL_GATEWAY_PROTOCOL = 'xiaohui-model-gateway/v1'
export const CANDIDATE_GATEWAY_PROVIDER = 'xiaohui-host'

function nonBlank(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function sameSecret(expected, actual) {
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function readJsonBody(request, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) throw Object.assign(new Error('model gateway request is too large'), { statusCode: 413 })
    chunks.push(chunk)
  }
  let value
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('model gateway request must be valid JSON'), { statusCode: 400 })
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.messages)) {
    throw Object.assign(new Error('model gateway request requires a messages array'), { statusCode: 400 })
  }
  return value
}

function sendJson(response, statusCode, value) {
  const body = `${JSON.stringify(value)}\n`
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  response.end(body)
}

function authorized(request, token) {
  const value = request.headers.authorization
  return typeof value === 'string' && value.startsWith('Bearer ')
    && sameSecret(token, value.slice('Bearer '.length))
}

async function listen(server, host) {
  server.listen(0, host)
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('model gateway did not bind a TCP port')
  return address.port
}

/** Resolve the Candidate model and proxy its remote calls through the Host LLM registry. */
export class CandidateModelRuntime {
  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config
  }

  async resolve(args = {}) {
    const explicitProvider = nonBlank(args.candidateProvider)
    const explicitModel = nonBlank(args.candidateModel)
    if (Boolean(explicitProvider) !== Boolean(explicitModel)) {
      throw new Error('candidateProvider and candidateModel must be supplied together')
    }
    const configuredProvider = nonBlank(this.config.candidateProvider)
    const configuredModel = nonBlank(this.config.candidateModel)
    if (Boolean(configuredProvider) !== Boolean(configuredModel)) {
      throw new Error('Harbor candidateProvider and candidateModel configuration must be supplied together')
    }

    const inherited = this.ctx.agentDefaultModel.currentSelection()
    const provider = explicitProvider ?? configuredProvider ?? inherited.provider
    const model = explicitModel ?? configuredModel ?? inherited.model
    const explicitReasoning = nonBlank(args.candidateReasoningEffort)
    const configuredReasoning = nonBlank(this.config.candidateReasoningEffort)
    const canInheritReasoning = provider === inherited.provider && model === inherited.model
    const reasoningEffort = explicitReasoning ?? configuredReasoning
      ?? (canInheritReasoning ? inherited.reasoningEffort : undefined)

    if (!this.ctx.llm.listProviders().some(item => item.id === provider)) {
      throw new Error(`Candidate model provider "${provider}" is not registered in XiaoHui Harness`)
    }
    const modelInfo = await this.ctx.llm.resolveModelInfo(provider, model)
    if (provider === 'openai-codex') {
      const auth = this.ctx.get('codexAuth')
      if (auth === undefined || typeof auth.status !== 'function') {
        throw new Error('Candidate model openai-codex requires the dsh-codex-auth service')
      }
      const status = await auth.status()
      if (!status.configured) {
        throw new Error('Candidate model openai-codex is not signed in; complete GPT Auth in Settings before starting Harbor')
      }
    }

    return {
      provider,
      model,
      ...(reasoningEffort === undefined ? {} : { reasoning_effort: String(reasoningEffort) }),
      transport: 'xiaohui-host-broker',
      protocol: MODEL_GATEWAY_PROTOCOL,
      model_info: modelInfo,
    }
  }

  async openLease(binding, scope) {
    const token = randomBytes(32).toString('base64url')
    const route = `/harbor-model-gateway/v1/${randomBytes(18).toString('base64url')}`
    const controllers = new Set()
    let requestCount = 0
    const server = createServer(async (request, response) => {
      if (request.url !== route || !authorized(request, token)) {
        sendJson(response, 404, { error: 'not found' })
        return
      }
      if (request.method === 'GET') {
        sendJson(response, 200, {
          protocol: MODEL_GATEWAY_PROTOCOL,
          candidate_digest: scope.candidateDigest,
          job: scope.jobName,
          binding: {
            provider: binding.provider,
            model: binding.model,
            ...(binding.reasoning_effort === undefined ? {} : { reasoning_effort: binding.reasoning_effort }),
          },
        })
        return
      }
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'method not allowed' })
        return
      }
      if (requestCount >= this.config.modelBrokerMaxRequests) {
        sendJson(response, 429, { error: 'model gateway request budget exhausted' })
        return
      }
      requestCount += 1
      const controller = new AbortController()
      controllers.add(controller)
      response.on('close', () => {
        if (!response.writableEnded) controller.abort(new Error('Candidate disconnected'))
      })
      try {
        const body = await readJsonBody(request, this.config.modelBrokerMaxRequestBytes)
        const {
          provider: _provider,
          model: _model,
          reasoningEffort: _reasoningEffort,
          signal: _signal,
          ...requestOptions
        } = body
        response.writeHead(200, {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-store',
        })
        const stream = this.ctx.llm.stream({
          ...requestOptions,
          provider: binding.provider,
          model: binding.model,
          ...(binding.reasoning_effort === undefined ? {} : { reasoningEffort: binding.reasoning_effort }),
          signal: controller.signal,
        })
        for await (const chunk of stream) {
          if (!response.write(`${JSON.stringify(chunk)}\n`)) await once(response, 'drain')
        }
        response.end()
      } catch (error) {
        if (!response.headersSent) {
          const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 502
          const message = error instanceof Error ? error.message : String(error)
          sendJson(response, statusCode, { error: message })
        } else if (!response.writableEnded) {
          response.destroy(error instanceof Error ? error : new Error(String(error)))
        }
      } finally {
        controllers.delete(controller)
      }
    })

    const port = await listen(server, this.config.modelBrokerBindHost)
    const endpoint = `http://${this.config.modelBrokerAdvertisedHost}:${port}${route}`
    let closed = false
    return {
      protocol: MODEL_GATEWAY_PROTOCOL,
      endpoint,
      token,
      candidateProvider: CANDIDATE_GATEWAY_PROVIDER,
      modelInfo: binding.model_info,
      async close() {
        if (closed) return
        closed = true
        for (const controller of controllers) controller.abort(new Error('Harbor Job ended'))
        const close = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
        server.closeAllConnections()
        await close
      },
    }
  }
}
