/**
 * Desktop overlay plugin: notify the Tauri shell when a turn completes.
 *
 * Loaded through `dsh web --patch` from the desktop shell. It does not live
 * in `packages/` and is not part of the upstream Harness tree.
 */

export const name = 'dsh-desktop-notify'

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http: https:",
  "frame-src http: https: data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ')

const SECURITY_META = [
  `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`,
  '<meta name="referrer" content="no-referrer">',
].join('')

/**
 * Subscribe to session events and POST completed turns to the native shell.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'html', placement: 'head', html: SECURITY_META })
  })

  const notifyUrl = process.env.DSH_DESKTOP_NOTIFY_URL
  if (!notifyUrl) {
    return
  }

  ctx.on('session/event', (session, event) => {
    if (event?.type !== 'turn/end') {
      return
    }
    if (event.data?.reason?.kind !== 'completed') {
      return
    }

    const payload = JSON.stringify({
      title: '任务完成',
      body: 'XiaoHui Harness 已完成本轮任务',
      sessionId: session?.id ?? '',
      reason: 'completed',
    })

    fetch(notifyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    }).catch(() => {
      // The shell may have exited; a missed toast must not fail the Host.
    })
  })
}
