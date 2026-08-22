export const DASHBOARD_ROUTE = '/_dsh/harbor-evolution/dashboard'
export const JOB_ROUTE = '/_dsh/harbor-evolution/job'
export const TRIALS_ROUTE = '/_dsh/harbor-evolution/trials'
export const TRIAL_ROUTE = '/_dsh/harbor-evolution/trial'
export const DATASET_ROUTE = '/_dsh/harbor-evolution/dataset'
export const PROGRESS_ROUTE = '/_dsh/harbor-evolution/progress'
export const COMPARE_ROUTE = '/_dsh/harbor-evolution/compare'
export const GOVERNANCE_ROUTE = '/_dsh/harbor-evolution/governance'
export const EVALUATOR_ROUTE = '/_dsh/harbor-evolution/evaluator'
const MAX_MUTATION_BYTES = 256 * 1024

function sendJson(response, status, body) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

export function isSameOriginRequest(request) {
  const fetchSite = request.headers['sec-fetch-site']
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false
  const origin = request.headers.origin
  if (!origin) {
    if (fetchSite === 'same-origin' || fetchSite === 'none') return true
    const address = request.socket?.remoteAddress ?? ''
    return address === '::1' || address === '127.0.0.1' || address.startsWith('127.') || address.startsWith('::ffff:127.')
  }
  const host = request.headers.host
  if (!host) return false
  try {
    const parsed = new URL(origin)
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === host
  } catch {
    return false
  }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/(?:\/[A-Za-z0-9._ -]+){2,}/g, '[local path]').replace(/[A-Za-z]:\\[^\s]+/g, '[local path]')
}

export function createApiHandler(load, code = 'request-failed') {
  return (request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' })
      response.end()
      return
    }
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin request required' } })
      return
    }
    const url = new URL(request.url ?? '/', 'http://localhost')
    const args = Object.fromEntries(url.searchParams)
    Promise.resolve(load(args)).then(
      value => sendJson(response, 200, { ok: true, value }),
      error => sendJson(response, 500, { ok: false, error: { code, message: safeError(error) } }),
    )
  }
}

export function createDashboardHandler(service) {
  return createApiHandler(() => service.dashboard(), 'dashboard-unavailable')
}

export function createMutationHandler(update, code = 'update-failed') {
  return async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'POST' })
      response.end()
      return
    }
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin request required' } })
      return
    }
    if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      sendJson(response, 415, { ok: false, error: { code: 'unsupported-media-type', message: 'application/json required' } })
      return
    }
    try {
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > MAX_MUTATION_BYTES) {
          sendJson(response, 413, { ok: false, error: { code: 'payload-too-large', message: 'request body is too large' } })
          return
        }
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const value = await update(body)
      sendJson(response, 200, { ok: true, value })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: { code, message: safeError(error) } })
    }
  }
}

export function installDashboardWeb(ctx, service) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['webServer'], (webCtx) => {
    const routes = [
      [DASHBOARD_ROUTE, createDashboardHandler(service)],
      [JOB_ROUTE, createApiHandler(args => service.job(args), 'job-unavailable')],
      [TRIALS_ROUTE, createApiHandler(args => service.trials(args), 'trials-unavailable')],
      [TRIAL_ROUTE, createApiHandler(args => service.trial(args), 'trial-unavailable')],
      [DATASET_ROUTE, createApiHandler(args => service.dataset(args), 'dataset-unavailable')],
      [PROGRESS_ROUTE, createApiHandler(args => service.progress(args), 'progress-unavailable')],
      [COMPARE_ROUTE, createApiHandler(args => service.comparison(args), 'comparison-unavailable')],
      [GOVERNANCE_ROUTE, createApiHandler(args => service.governance(args), 'governance-unavailable')],
      [EVALUATOR_ROUTE, createMutationHandler(args => service.evaluator(args), 'evaluator-update-failed')],
    ]
    for (const [route, handler] of routes) {
      webCtx.effect(() => webCtx.webServer.register({ kind: 'exact', path: route, handler }), `harbor-evolution: ${route}`)
    }
  })
}
