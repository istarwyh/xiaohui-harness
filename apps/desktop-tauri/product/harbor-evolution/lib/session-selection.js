import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'

import { foldSessionDiagnosticIndex } from './session-projection.js'

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalize(value[key])]),
    )
  }
  return value
}

export function canonicalDigest(value, namespace) {
  const body = JSON.stringify(canonicalize(value))
  return `sha256:${createHash('sha256').update(namespace).update('\0').update(body).digest('hex')}`
}

function sessionHeaderIdentity(header, effectiveAgentPreset) {
  return {
    version: header?.version,
    id: header?.id,
    createdAt: header?.createdAt,
    cwd: header?.cwd,
    parentSession: header?.parentSession,
    seedLength: header?.seedLength,
    origin: header?.origin,
    delegationDepth: header?.delegationDepth,
    ...(effectiveAgentPreset === undefined ? {} : { agentPreset: effectiveAgentPreset }),
  }
}

function sameProjectRoot(value, projectRoot) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return false
  return path.resolve(value) === path.resolve(projectRoot)
}

function isoTime(value) {
  return Number.isSafeInteger(value) && value > 0 ? new Date(value).toISOString() : null
}

function safeIdentity(value, rawSessionId) {
  const text = typeof value === 'string' ? value : ''
  if (rawSessionId && text.includes(rawSessionId)) return '[redacted-identity]'
  if (
    /(?:api[_-]?key|token|secret|password|authorization|bearer\s+)/i.test(text)
    || /(?:^|[\\/])(?:Users|home|private|tmp|var|etc|opt|Volumes)(?:[\\/]|$)/.test(text)
    || /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/.test(text)
  ) return '[redacted-identity]'
  return text.slice(0, 160)
}

async function mapConcurrent(values, concurrency, mapper) {
  const result = new Array(values.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      try {
        result[index] = { status: 'fulfilled', value: await mapper(values[index], index) }
      } catch (reason) {
        result[index] = { status: 'rejected', reason }
      }
    }
  })
  await Promise.all(workers)
  return result
}

function publicSelection(item, index) {
  const agentPreset = item.index.effectiveAgentPreset ?? item.header.agentPreset
  return {
    trialId: item.trialId,
    title: `历史会话 ${index + 1}`,
    createdAt: isoTime(item.header.createdAt),
    lastActivityAt: isoTime(item.index.lastActivityAt),
    turnCount: item.index.turnCount,
    humanMessageCount: item.index.humanMessageCount,
    assistantMessageCount: item.index.assistantMessageCount,
    toolCallCount: item.index.toolCallCount,
    lastTurnReason: item.index.lastTurnReason,
    agentPreset: agentPreset ? safeIdentity(agentPreset, item.rawSessionId) : null,
    modelRoutes: item.index.modelRoutes.map(route => ({
      provider: safeIdentity(route.provider, item.rawSessionId),
      model: safeIdentity(route.model, item.rawSessionId),
      ...(route.reasoning_effort ? { reasoning_effort: safeIdentity(route.reasoning_effort, item.rawSessionId) } : {}),
    })),
  }
}

export async function selectRecentSessions({
  sessionQuery,
  projectRoot,
  currentSessionId,
  limit = 10,
  maxSessionReads = 100,
  concurrency = 4,
  createdAfter,
  signal,
}) {
  if (!sessionQuery || typeof sessionQuery.readSession !== 'function') {
    throw new Error('DSH_SESSION_QUERY_UNAVAILABLE: this DSH Profile does not expose the Session Query service')
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('SESSION_LIMIT_INVALID: limit must be an integer from 1 to 10')
  }
  if (createdAfter !== undefined && (!Number.isSafeInteger(createdAfter) || createdAfter < 0)) {
    throw new Error('SESSION_CREATED_AFTER_INVALID: createdAfter must be a valid timestamp')
  }
  const listed = typeof sessionQuery.filterSessions === 'function'
    ? await sessionQuery.filterSessions([
        { kind: 'cwd', values: [projectRoot] },
        ...(createdAfter === undefined ? [] : [{ kind: 'created-at', from: createdAfter }]),
      ], signal)
    : await sessionQuery.listSessions(signal)
  const excludedCounts = {
    outsideWorkspace: 0,
    beforeCreatedAfter: 0,
    currentSession: 0,
    subagent: 0,
    forkOrChild: 0,
    openTurn: 0,
    noDirectHumanInput: 0,
    noAssistantOutput: 0,
    userAborted: 0,
    harborInternal: 0,
    empty: 0,
    unreadable: 0,
  }
  const candidates = []
  for (const record of Array.isArray(listed) ? listed : []) {
    const header = record?.header ?? {}
    if (!sameProjectRoot(header.cwd, projectRoot)) {
      excludedCounts.outsideWorkspace += 1
    } else if (header.id === currentSessionId) {
      excludedCounts.currentSession += 1
    } else if (createdAfter !== undefined && Number(header.createdAt) < createdAfter) {
      excludedCounts.beforeCreatedAfter += 1
    } else if (header.origin === 'subagent') {
      excludedCounts.subagent += 1
    } else if (
      header.parentSession !== undefined
      || Number(header.seedLength ?? 0) > 0
      || Number(header.delegationDepth ?? 0) > 0
    ) {
      excludedCounts.forkOrChild += 1
    } else {
      candidates.push(record)
    }
  }
  if (candidates.length > maxSessionReads) {
    throw new Error(
      `SESSION_SELECTION_TOO_EXPENSIVE: ${candidates.length} exact Session reads exceed maxSessionReads=${maxSessionReads}; preview again with createdAfter to narrow the scan`,
    )
  }

  const snapshots = await mapConcurrent(candidates, concurrency, async record => {
    const snapshot = await sessionQuery.readSession(record.header.id)
    if (snapshot?.session?.id !== record.header.id) {
      throw new Error('Session Query returned a mismatched Session header')
    }
    if (!sameProjectRoot(snapshot.session.cwd, projectRoot)) {
      throw new Error('Session Query changed the Session workspace boundary')
    }
    return snapshot
  })
  const eligible = []
  for (const outcome of snapshots) {
    if (outcome.status === 'rejected') {
      excludedCounts.unreadable += 1
      continue
    }
    const snapshot = outcome.value
    const index = foldSessionDiagnosticIndex(snapshot.events, snapshot.session)
    if (index.lastSeq === null) {
      excludedCounts.empty += 1
      continue
    }
    if (index.openTurn) {
      excludedCounts.openTurn += 1
      continue
    }
    if (index.lastTurnReason === 'aborted') {
      excludedCounts.userAborted += 1
      continue
    }
    if (index.humanMessageCount < 1) {
      excludedCounts.noDirectHumanInput += 1
      continue
    }
    if (index.assistantMessageCount < 1) {
      excludedCounts.noAssistantOutput += 1
      continue
    }
    if (index.hasHarborToolCall) {
      excludedCounts.harborInternal += 1
      continue
    }
    if (/harbor/i.test(String(index.effectiveAgentPreset ?? ''))) {
      excludedCounts.harborInternal += 1
      continue
    }
    const header = sessionHeaderIdentity(snapshot.session, index.effectiveAgentPreset)
    const sourceDigest = canonicalDigest(
      { session: header, events: snapshot.events },
      'harbor-dsh-session-source-v1',
    )
    const sourceRef = canonicalDigest(
      { id: snapshot.session.id, header },
      'harbor-dsh-session-source-ref-v1',
    )
    eligible.push({
      rawSessionId: snapshot.session.id,
      header,
      events: snapshot.events,
      index,
      sourceDigest,
      sourceRef,
      capturedThroughSeq: index.lastSeq,
      trialId: `session-${sourceRef.slice('sha256:'.length, 'sha256:'.length + 12)}`,
    })
  }
  eligible.sort((left, right) => (
    right.index.lastActivityAt - left.index.lastActivityAt
    || left.sourceRef.localeCompare(right.sourceRef)
  ))
  const selected = eligible.slice(0, limit)
  return {
    selected,
    publicSelected: selected.map(publicSelection),
    excludedCounts,
    warnings: excludedCounts.unreadable
      ? [`${excludedCounts.unreadable} Session(s) could not be read and were excluded.`]
      : [],
  }
}

export function verifySessionSnapshot(expected, snapshot, projectRoot) {
  if (snapshot?.session?.id !== expected.rawSessionId || !sameProjectRoot(snapshot?.session?.cwd, projectRoot)) {
    return false
  }
  const index = foldSessionDiagnosticIndex(snapshot.events, snapshot.session)
  if (index.lastSeq !== expected.capturedThroughSeq || index.openTurn) return false
  const digest = canonicalDigest(
    { session: sessionHeaderIdentity(snapshot.session, index.effectiveAgentPreset), events: snapshot.events },
    'harbor-dsh-session-source-v1',
  )
  return digest === expected.sourceDigest
}

export class SessionSelectionTokenStore {
  constructor({ ttlMs = 15 * 60 * 1000, now = () => Date.now(), randomToken } = {}) {
    this.ttlMs = ttlMs
    this.now = now
    this.randomToken = randomToken ?? (() => randomBytes(32).toString('base64url'))
    this.tokens = new Map()
  }

  issue(value) {
    this.purge()
    const token = this.randomToken()
    const expiresAt = this.now() + this.ttlMs
    this.tokens.set(token, { ...value, expiresAt })
    return { token, expiresAt }
  }

  consume(token, { ownerSessionId, projectRoot }) {
    const stored = this.tokens.get(token)
    if (!stored) throw new Error('SESSION_SELECTION_TOKEN_INVALID: preview again before running the diagnostic')
    // Consume before validation so a stolen or failed token cannot be replayed.
    this.tokens.delete(token)
    if (stored.ownerSessionId !== ownerSessionId) {
      throw new Error('SESSION_SELECTION_TOKEN_OWNER_MISMATCH: the token belongs to another Agent Session')
    }
    if (path.resolve(stored.projectRoot) !== path.resolve(projectRoot)) {
      throw new Error('SESSION_SELECTION_TOKEN_WORKSPACE_MISMATCH: the token belongs to another workspace')
    }
    if (stored.expiresAt <= this.now()) {
      throw new Error('SESSION_SELECTION_TOKEN_EXPIRED: preview again before running the diagnostic')
    }
    this.purge()
    return stored
  }

  purge() {
    const now = this.now()
    for (const [token, value] of this.tokens) {
      if (value.expiresAt <= now) this.tokens.delete(token)
    }
  }
}
