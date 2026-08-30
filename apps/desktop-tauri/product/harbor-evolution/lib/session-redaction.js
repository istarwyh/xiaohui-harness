import { canonicalDigest } from './session-selection.js'

const MAX_MESSAGE_CHARS = 4_000
const MAX_TRANSCRIPT_MESSAGES = 80
const MAX_OBSERVATION_BYTES = 512 * 1024

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
  /\b(?:authorization\s*[:=]\s*(?:bearer\s+)?|bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd)\s*[:=]\s*["']?[^\s,"'}\]]{4,}/gi,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g,
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
]

const ABSOLUTE_PATH = /(?:[A-Za-z]:\\(?:[^\s<>:"|?*]+\\)+[^\s<>:"|?*]*|\/(?:Users|home|private|tmp|var|etc|opt|Volumes|workspace)(?:\/[A-Za-z0-9._ @+-]+)+)/g

function replaceCanaries(value, canaries) {
  let text = value
  let replacements = 0
  for (const canary of canaries) {
    if (!canary || !text.includes(canary)) continue
    const pieces = text.split(canary)
    replacements += pieces.length - 1
    text = pieces.join('[REDACTED_SESSION_ID]')
  }
  return { text, replacements }
}

function replaceSecrets(value, canaries = []) {
  const canaryResult = replaceCanaries(value, canaries)
  value = canaryResult.text
  let text = value
  let replacements = canaryResult.replacements
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, () => {
      replacements += 1
      return '[REDACTED_SECRET]'
    })
  }
  text = text.replace(ABSOLUTE_PATH, () => {
    replacements += 1
    return '[REDACTED_PATH]'
  })
  return { text, replacements }
}

function sanitizeText(value, maxChars = MAX_MESSAGE_CHARS, canaries = []) {
  const input = String(value ?? '')
  const redacted = replaceSecrets(input, canaries)
  const truncated = redacted.text.length > maxChars
  return {
    text: truncated ? `${redacted.text.slice(0, maxChars)}\n[TRUNCATED]` : redacted.text,
    replacements: redacted.replacements,
    truncated,
  }
}

function isoTime(value) {
  return Number.isSafeInteger(value) && value > 0 ? new Date(value).toISOString() : null
}

function appendOrigin(event) {
  return event?.surfaceOp === undefined || event.surfaceOp === 'append'
}

function visibleContent(message, report, canaries) {
  const content = []
  for (const block of Array.isArray(message?.content) ? message.content : []) {
    if (block?.type !== 'text' || typeof block.text !== 'string') continue
    const sanitized = sanitizeText(block.text, MAX_MESSAGE_CHARS, canaries)
    report.replacements += sanitized.replacements
    if (sanitized.truncated) report.truncations += 1
    if (sanitized.text.trim()) content.push({ type: 'text', text: sanitized.text })
  }
  return content
}

function messageRef(message) {
  return canonicalDigest(
    { id: typeof message?.id === 'string' ? message.id : null },
    'harbor-dsh-session-message-ref-v1',
  )
}

function sanitizeIdentity(value, report, canaries) {
  const sanitized = sanitizeText(value, 160, canaries)
  report.replacements += sanitized.replacements
  if (sanitized.truncated) report.truncations += 1
  return sanitized.text
}

function modelSegments(selected, report, canaries) {
  return selected.index.modelSegments.map(segment => ({
    from_seq: segment.from_seq,
    through_seq: segment.through_seq,
    provider: sanitizeIdentity(segment.provider, report, canaries),
    model: sanitizeIdentity(segment.model, report, canaries),
    ...(segment.reasoning_effort
      ? { reasoning_effort: sanitizeIdentity(segment.reasoning_effort, report, canaries) }
      : {}),
  }))
}

function toolEvidence(events) {
  const results = new Map()
  for (const event of events) {
    if (event?.type !== 'tool/result') continue
    results.set(event.data?.message?.source?.callId, event)
  }
  const tools = []
  for (const event of events) {
    if (event?.type !== 'tool/call') continue
    const result = results.get(event.data?.callId)
    tools.push({
      event_seq: event.seq,
      name: String(event.data?.name ?? 'unknown').slice(0, 160),
      outcome: result?.data?.error || result?.data?.message?.content?.[0]?.isError ? 'error' : result ? 'success' : 'unknown',
      error_code: typeof result?.data?.error?.code === 'string'
        ? result.data.error.code.slice(0, 160)
        : null,
      result_summary: result ? 'Tool completed; payload intentionally omitted.' : 'No matching tool result observed.',
      truncated: true,
    })
  }
  return tools.slice(0, 200)
}

function turnEvidence(events) {
  const starts = new Map()
  const turns = []
  for (const event of events) {
    if (event?.type === 'turn/start') starts.set(event.data?.turn, event.time)
    if (event?.type === 'turn/end') {
      turns.push({
        turn: event.data?.turn,
        reason: event.data?.reason?.kind ?? 'unknown',
        started_at: isoTime(starts.get(event.data?.turn)),
        ended_at: isoTime(event.time),
      })
    }
  }
  return turns
}

function usageEvidence(events) {
  let inputTokens = 0
  let outputTokens = 0
  let reported = false
  for (const event of events) {
    if (event?.type !== 'assistant/message' || !event.data?.usage) continue
    const usage = event.data.usage
    if (Number.isFinite(usage.inputTokens)) inputTokens += usage.inputTokens
    if (Number.isFinite(usage.outputTokens)) outputTokens += usage.outputTokens
    reported = true
  }
  return { input_tokens: inputTokens, output_tokens: outputTokens, reported }
}

function sanitizeFeedback(items, report, canaries) {
  const output = []
  for (const item of Array.isArray(items) ? items : []) {
    if (!['positive', 'negative'].includes(item?.rating)) continue
    const note = sanitizeText(item.note ?? '', 1_000, canaries)
    report.replacements += note.replacements
    if (note.truncated) report.truncations += 1
    output.push({
      message_ref: canonicalDigest({ id: item.messageId ?? null }, 'harbor-dsh-feedback-message-ref-v1'),
      rating: item.rating,
      ...(note.text.trim() ? { note: note.text } : {}),
      updated_at: isoTime(item.updatedAt),
    })
  }
  return output.slice(0, 100)
}

function assertNoSecret(value, canaries = []) {
  const serialized = JSON.stringify(value)
  for (const canary of canaries) {
    if (canary.length >= 8 && serialized.includes(canary)) {
      throw new Error('SESSION_REDACTION_FAILED: a raw Session id survived the redaction pipeline')
    }
  }
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(serialized)) {
      throw new Error('SESSION_REDACTION_FAILED: a credential-shaped value survived the redaction pipeline')
    }
  }
  ABSOLUTE_PATH.lastIndex = 0
  if (ABSOLUTE_PATH.test(serialized)) {
    throw new Error('SESSION_REDACTION_FAILED: an absolute local path survived the redaction pipeline')
  }
  if (Buffer.byteLength(serialized) > MAX_OBSERVATION_BYTES) {
    throw new Error(`SESSION_OBSERVATION_TOO_LARGE: redacted observation exceeds ${MAX_OBSERVATION_BYTES} bytes`)
  }
}

const policyWithoutDigest = {
  id: 'dsh-session-default-redaction',
  version: '1.0.0',
  projection: 'direct-human-and-assembled-assistant-text',
  tool_payloads: 'omit',
  reasoning: 'omit',
  attachments: 'omit',
  credentials: 'redact-and-fail-closed',
}

export const DEFAULT_REDACTION_POLICY = Object.freeze({
  ...policyWithoutDigest,
  digest: canonicalDigest(policyWithoutDigest, 'harbor-dsh-session-redaction-policy-v1'),
})

export function buildSessionObservation(selected, feedbackItems = []) {
  const report = { replacements: 0, truncations: 0, omitted_blocks: 0 }
  const canaries = [String(selected.rawSessionId ?? '')].filter(Boolean)
  const visibleTranscript = []
  for (const event of selected.events) {
    if (!appendOrigin(event)) continue
    let role
    let message
    if (event?.type === 'user/message' && event.data?.source?.kind === 'user') {
      role = 'user'
      message = event.data
    } else if (event?.type === 'assistant/message') {
      role = 'assistant'
      message = event.data?.message
    } else {
      continue
    }
    const content = visibleContent(message, report, canaries)
    const originalBlocks = Array.isArray(message?.content) ? message.content.length : 0
    report.omitted_blocks += Math.max(0, originalBlocks - content.length)
    if (!content.length) continue
    if (visibleTranscript.length >= MAX_TRANSCRIPT_MESSAGES) {
      report.truncations += 1
      break
    }
    visibleTranscript.push({
      event_seq: event.seq,
      message_ref: messageRef(message),
      role,
      content,
      time: isoTime(event.time),
    })
  }
  const initialGoal = visibleTranscript.find(message => message.role === 'user')?.content
    ?.map(block => block.text).join('\n') ?? ''
  const sanitizedTitle = sanitizeText(
    initialGoal.split('\n').find(Boolean) ?? 'Historical DSH Session',
    120,
    canaries,
  )
  report.replacements += sanitizedTitle.replacements
  if (sanitizedTitle.truncated) report.truncations += 1

  const agentPreset = selected.index.effectiveAgentPreset ?? selected.header.agentPreset
  const observation = {
    schema_version: 1,
    protocol: 'dsh-session-observation/v1',
    record_kind: 'dsh-session',
    execution_mode: 'observe-existing',
    trial_id: selected.trialId,
    source: {
      ref: selected.sourceRef,
      captured_through_seq: selected.capturedThroughSeq,
      source_digest: selected.sourceDigest,
      created_at: isoTime(selected.header.createdAt),
      last_activity_at: isoTime(selected.index.lastActivityAt),
      last_turn_reason: selected.index.lastTurnReason,
      session_format_version: selected.header.version,
    },
    generator: {
      agent_preset: agentPreset
        ? sanitizeIdentity(agentPreset, report, canaries)
        : null,
      model_segments: modelSegments(selected, report, canaries),
    },
    task: {
      title: sanitizedTitle.text || 'Historical DSH Session',
      initial_user_goal: initialGoal,
      turn_count: selected.index.turnCount,
    },
    visible_transcript: visibleTranscript,
    execution: {
      tools: toolEvidence(selected.events),
      turns: turnEvidence(selected.events),
      usage: usageEvidence(selected.events),
    },
    feedback: { items: sanitizeFeedback(feedbackItems, report, canaries) },
    completeness: {
      transcript_complete: visibleTranscript.length < MAX_TRANSCRIPT_MESSAGES,
      tool_payloads_complete: false,
      attachments_complete: false,
      truncations: report.truncations ? [`${report.truncations} bounded text projection(s)`] : [],
    },
    redaction: report,
  }
  observation.digest = canonicalDigest(observation, 'harbor-dsh-session-observation-v1')
  assertNoSecret(observation, canaries)
  return observation
}

export function scanForCredentialCanaries(value) {
  try {
    assertNoSecret(value)
    return []
  } catch (error) {
    return [error.message]
  }
}
