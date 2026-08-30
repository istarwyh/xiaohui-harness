function isAppendOrigin(event) {
  return event?.surfaceOp === undefined || event.surfaceOp === 'append'
}

function finiteInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function visibleTextBlocks(message) {
  return Array.isArray(message?.content)
    ? message.content.filter(block => block?.type === 'text' && typeof block.text === 'string' && block.text.trim())
    : []
}

function routeKey(route) {
  return `${route.provider}\u0000${route.model}\u0000${route.reasoning_effort ?? ''}`
}

/**
 * Resolve the composition that actually produced the Session history.
 *
 * DSH freezes the creation-time preset in the Session header, but a blank
 * Session may select another preset before its first turn. That selection is
 * durable evidence and the newest `agent-preset/selected` event wins.
 */
export function resolveEffectiveAgentPreset(header, events) {
  for (let index = Array.isArray(events) ? events.length - 1 : -1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'agent-preset/selected') {
      return typeof event.data?.agentPreset === 'string'
        ? event.data.agentPreset
        : undefined
    }
  }
  return typeof header?.agentPreset === 'string' ? header.agentPreset : undefined
}

/**
 * Fold only non-content selection facts from a validated DSH Session log.
 * Transcript text deliberately never enters this projection.
 */
export function foldSessionDiagnosticIndex(events, header) {
  const openTurns = new Set()
  const seenTurns = new Set()
  const headerRouteEvents = []
  const contextRouteEvents = []
  const assistantRouteEvents = []
  let lastActivityAt = 0
  let lastSeq = null
  let humanMessageCount = 0
  let assistantMessageCount = 0
  let lastTurnReason = null
  let hasHarborToolCall = false
  let toolCallCount = 0

  for (const event of Array.isArray(events) ? events : []) {
    const seq = finiteInteger(event?.seq)
    const time = finiteInteger(event?.time)
    if (seq !== undefined) lastSeq = lastSeq === null ? seq : Math.max(lastSeq, seq)
    if (time !== undefined) lastActivityAt = Math.max(lastActivityAt, time)

    if (event?.type === 'turn/start') {
      const turn = finiteInteger(event.data?.turn)
      if (turn !== undefined) {
        openTurns.add(turn)
        seenTurns.add(turn)
      }
    } else if (event?.type === 'turn/end') {
      const turn = finiteInteger(event.data?.turn)
      if (turn !== undefined) {
        openTurns.delete(turn)
        seenTurns.add(turn)
      }
      lastTurnReason = typeof event.data?.reason?.kind === 'string'
        ? event.data.reason.kind
        : null
    } else if (event?.type === 'user/message' && isAppendOrigin(event)) {
      if (event.data?.source?.kind === 'user' && visibleTextBlocks(event.data).length) {
        humanMessageCount += 1
      }
    } else if (event?.type === 'assistant/message' && isAppendOrigin(event)) {
      if (visibleTextBlocks(event.data?.message).length) assistantMessageCount += 1
      const source = event.data?.message?.source
      if (source?.kind === 'model' && typeof source.provider === 'string' && typeof source.model === 'string') {
        const route = { provider: source.provider, model: source.model }
        assistantRouteEvents.push({ seq: seq ?? 0, ...route })
      }
    } else if (event?.type === 'tool/call') {
      toolCallCount += 1
      const name = String(event.data?.name ?? '')
      if (name.startsWith('harbor_')) hasHarborToolCall = true
    } else if (event?.type === 'request/context') {
      const { provider, model } = event.data ?? {}
      if (typeof provider === 'string' && typeof model === 'string') {
        const route = { provider, model }
        contextRouteEvents.push({ seq: seq ?? 0, ...route })
      }
    } else if (event?.type === 'request/header') {
      const config = event.data?.header?.config
      if (typeof config?.provider === 'string' && typeof config?.model === 'string') {
        const route = {
          provider: config.provider,
          model: config.model,
          ...(typeof config.reasoningEffort === 'string'
            ? { reasoning_effort: config.reasoningEffort }
            : {}),
        }
        headerRouteEvents.push({ seq: seq ?? 0, ...route })
      }
    }
  }

  // request/header is the canonical full request identity. Fall back to
  // request/context or assembled assistant provenance only for older logs.
  const routeEvents = headerRouteEvents.length
    ? headerRouteEvents
    : contextRouteEvents.length ? contextRouteEvents : assistantRouteEvents
  const modelSegments = []
  for (const route of routeEvents) {
    const previous = modelSegments.at(-1)
    if (previous && routeKey(previous) === routeKey(route)) continue
    modelSegments.push({
      from_seq: route.seq,
      through_seq: lastSeq ?? route.seq,
      provider: route.provider,
      model: route.model,
      ...(route.reasoning_effort ? { reasoning_effort: route.reasoning_effort } : {}),
    })
  }
  for (let index = 0; index < modelSegments.length - 1; index += 1) {
    modelSegments[index].through_seq = Math.max(
      modelSegments[index].from_seq,
      modelSegments[index + 1].from_seq - 1,
    )
  }
  const routes = new Map()
  for (const segment of modelSegments) {
    const route = {
      provider: segment.provider,
      model: segment.model,
      ...(segment.reasoning_effort ? { reasoning_effort: segment.reasoning_effort } : {}),
    }
    routes.set(routeKey(route), route)
  }

  const effectiveAgentPreset = resolveEffectiveAgentPreset(header, events)
  return {
    lastActivityAt,
    lastSeq,
    openTurn: openTurns.size > 0,
    turnCount: seenTurns.size,
    humanMessageCount,
    assistantMessageCount,
    toolCallCount,
    lastTurnReason,
    hasHarborToolCall,
    ...(effectiveAgentPreset === undefined ? {} : { effectiveAgentPreset }),
    modelRoutes: [...routes.values()].sort((left, right) => routeKey(left).localeCompare(routeKey(right))),
    modelSegments,
  }
}
