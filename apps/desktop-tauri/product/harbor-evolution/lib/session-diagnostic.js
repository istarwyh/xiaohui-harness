import path from 'node:path'

import { buildHistoricalGenerationBatch, writePrivateHistoricalBatch } from './session-materializer.js'
import { buildSessionObservation } from './session-redaction.js'
import {
  canonicalDigest,
  SessionSelectionTokenStore,
  selectRecentSessions,
  verifySessionSnapshot,
} from './session-selection.js'

function capability(ctx, name) {
  try {
    return typeof ctx?.get === 'function' ? ctx.get(name) ?? ctx[name] : ctx?.[name]
  } catch {
    return ctx?.[name]
  }
}

function executionIdentity(exec) {
  const header = exec?.agent?.session?.header
  if (typeof header?.cwd !== 'string' || !path.isAbsolute(header.cwd)) {
    throw new Error('Harbor Session tools require an Agent Session with an absolute working directory')
  }
  if (typeof header.id !== 'string' || !header.id) {
    throw new Error('Harbor Session tools require the calling Agent Session identity')
  }
  return { projectRoot: path.resolve(header.cwd), ownerSessionId: header.id }
}

function feedbackItems(result) {
  return result?.ok === true && Array.isArray(result.value?.items) ? result.value.items : []
}

async function readFeedback(service, sessionId) {
  if (!service || typeof service.list !== 'function') return { items: [], available: false, failed: false }
  try {
    const result = await service.list({ sessionId })
    return {
      items: feedbackItems(result),
      available: result?.ok === true,
      failed: result?.ok === false,
    }
  } catch {
    return { items: [], available: true, failed: true }
  }
}

function withoutRawEvents(selection) {
  const { events: _events, ...rest } = selection
  return rest
}

function parseCreatedAfter(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') {
    throw new Error('SESSION_CREATED_AFTER_INVALID: createdAfter must be an ISO-8601 string')
  }
  const parsed = Date.parse(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('SESSION_CREATED_AFTER_INVALID: createdAfter must be a valid ISO-8601 timestamp')
  }
  return parsed
}

function feedbackDigest(observation) {
  return canonicalDigest(
    {
      available: observation.available,
      failed: observation.failed,
      items: observation.items,
    },
    'harbor-dsh-session-feedback-snapshot-v1',
  )
}

function requestedJudge(args) {
  if (Boolean(args.evaluatorProvider) !== Boolean(args.evaluatorModel)) {
    throw new Error('EVALUATOR_MODEL_INVALID: evaluatorProvider and evaluatorModel must be supplied together')
  }
  if (args.evaluatorReasoningEffort !== undefined && !args.evaluatorProvider) {
    throw new Error('EVALUATOR_MODEL_INVALID: evaluatorReasoningEffort requires an explicit evaluatorProvider and evaluatorModel')
  }
  return {
    candidateProvider: args.evaluatorProvider,
    candidateModel: args.evaluatorModel,
    candidateReasoningEffort: args.evaluatorReasoningEffort,
  }
}

async function resolveJudge(modelRuntime, args) {
  const requested = requestedJudge(args)
  if (requested.candidateProvider) return modelRuntime.resolve(requested)
  if (typeof modelRuntime.resolveCurrent === 'function') {
    return modelRuntime.resolveCurrent()
  }
  const current = await modelRuntime.currentBinding()
  return modelRuntime.resolve({
    candidateProvider: current.provider,
    candidateModel: current.model,
    candidateReasoningEffort: current.reasoning_effort,
  })
}

function judgeIdentity(binding, selections) {
  if (!binding?.provider || !binding?.model) {
    throw new Error('EVALUATOR_MODEL_INVALID: Judge resolution returned no provider/model identity')
  }
  const route = `${binding.provider}/${binding.model}`
  const generatorRoutes = new Set(
    selections.flatMap(item => item.index.modelRoutes.map(value => `${value.provider}/${value.model}`)),
  )
  return {
    evaluator: { id: 'dsh-session-historical-evaluator', version: '1.0.0' },
    judge: {
      provider: binding.provider,
      model: binding.model,
      ...(binding.reasoning_effort === undefined
        ? {}
        : { reasoning_effort: binding.reasoning_effort }),
      transport: 'dsh-host-broker',
      protocol: 'dsh-host-model-gateway/v1',
    },
    coupling: generatorRoutes.size === 0
      ? 'generator-model-unknown-diagnostic-only'
      : generatorRoutes.has(route)
        ? 'same-host-model-diagnostic-only'
        : 'independent-historical-judge',
  }
}

export class SessionDiagnosticService {
  constructor({
    ctx,
    config,
    modelRuntime,
    runHistoricalEvaluation,
    tokenStore,
    now = () => new Date(),
  }) {
    this.ctx = ctx
    this.config = config
    this.modelRuntime = modelRuntime
    this.runHistoricalEvaluation = runHistoricalEvaluation
    this.tokens = tokenStore ?? new SessionSelectionTokenStore()
    this.now = now
  }

  async preview(args = {}, exec) {
    const identity = executionIdentity(exec)
    const sessionQuery = capability(this.ctx, 'sessionQuery')
    const limit = args.limit ?? 10
    const createdAfter = parseCreatedAfter(args.createdAfter)
    const result = await selectRecentSessions({
      sessionQuery,
      projectRoot: identity.projectRoot,
      currentSessionId: identity.ownerSessionId,
      limit,
      maxSessionReads: this.config.sessionMaxReads ?? 100,
      concurrency: this.config.sessionReadConcurrency ?? 4,
      createdAfter,
      signal: exec?.signal,
    })
    if (!result.selected.length) {
      throw new Error('NO_ELIGIBLE_SESSIONS: no completed top-level DSH Sessions with direct human input and assistant output were found in this workspace')
    }
    const judgeBinding = await resolveJudge(this.modelRuntime, args)
    const includeFeedback = args.includeFeedback !== false
    const feedback = capability(this.ctx, 'messageFeedback')
    const feedbackObservations = includeFeedback
      ? await Promise.all(result.selected.map(item => readFeedback(feedback, item.rawSessionId)))
      : result.selected.map(() => ({ items: [], available: false, failed: false }))
    const feedbackSnapshots = feedbackObservations.map(observation => ({
      available: observation.available,
      failed: observation.failed,
      digest: feedbackDigest(observation),
    }))
    const selected = result.publicSelected.map((item, index) => ({
      ...item,
      feedback: {
        available: feedbackObservations[index].available,
        positive: feedbackObservations[index].items.filter(value => value.rating === 'positive').length,
        negative: feedbackObservations[index].items.filter(value => value.rating === 'negative').length,
      },
    }))
    const evaluation = judgeIdentity(judgeBinding, result.selected)
    const issued = this.tokens.issue({
      ...identity,
      selection: result.selected.map(withoutRawEvents),
      feedbackSnapshots,
      judgeBinding,
      evaluation,
      parameters: { limit, includeFeedback, createdAfter, scope: 'exact-cwd', order: 'last-activity-desc' },
    })
    const warnings = [...result.warnings]
    if (feedbackObservations.some(item => item.failed)) {
      warnings.push('Some Message Feedback could not be read; the Session sample remains usable without it.')
    }
    warnings.push('Frozen Session observations remain local under .harbor/private and the Harbor jobs directory; review repository ignore and retention policy before committing artifacts.')
    return {
      schema_version: 1,
      capability: 'historical-generation-evaluation',
      jobKind: 'historical-generation-evaluation',
      projectRoot: identity.projectRoot,
      scope: 'exact-cwd',
      order: 'last-activity-desc',
      ...(createdAfter === undefined ? {} : { createdAfter: new Date(createdAfter).toISOString() }),
      executionMode: 'observe-existing',
      promotionEligible: false,
      evaluationLevel: 'trial',
      selectionToken: issued.token,
      expiresAt: new Date(issued.expiresAt).toISOString(),
      selected,
      excludedCounts: result.excludedCounts,
      warnings,
      estimatedJudgeRequests: selected.length,
      estimatedMaxBytes: selected.length * 512 * 1024,
      evaluation,
      retention: {
        privateEvidence: '.harbor/private/session-batches',
        jobEvidence: this.config.jobsDir ?? 'jobs',
        vcsPolicy: 'an ignore-all file is created only when .harbor/private/.gitignore is absent; existing private rules and jobs retention/VCS policy remain project-owned',
      },
      confirmation: `Run 1 historical-generation-evaluation Job with ${selected.length} immutable Trial(s) using ${evaluation.evaluator.id}@${evaluation.evaluator.version} and Judge ${evaluation.judge.provider}/${evaluation.judge.model} (${evaluation.coupling}); no Candidate will be executed or promoted.`,
    }
  }

  async run(args = {}, exec) {
    const identity = executionIdentity(exec)
    if (args.stackPath !== undefined) {
      throw new Error('HISTORICAL_CUSTOM_STACK_UNSUPPORTED: the first release binds the materialized Broker Evaluator and Stack as one immutable unit')
    }
    if (
      args.evaluatorProvider !== undefined
      || args.evaluatorModel !== undefined
      || args.evaluatorReasoningEffort !== undefined
    ) {
      throw new Error('HISTORICAL_JUDGE_NOT_CONFIRMED: choose the Judge during Preview, then Run with only the confirmed selectionToken')
    }
    const token = String(args.selectionToken ?? '')
    if (!token) throw new Error('selectionToken is required; call harbor_session_diagnostic_preview first')
    const selectedState = this.tokens.consume(token, identity)
    const sessionQuery = capability(this.ctx, 'sessionQuery')
    if (!sessionQuery || typeof sessionQuery.readSession !== 'function') {
      throw new Error('DSH_SESSION_QUERY_UNAVAILABLE: this DSH Profile does not expose the Session Query service')
    }
    const reads = await Promise.allSettled(
      selectedState.selection.map(item => sessionQuery.readSession(item.rawSessionId)),
    )
    if (reads.some(item => item.status === 'rejected')) {
      throw new Error('SESSION_SOURCE_READ_FAILED: at least one selected Session could not be re-read; no Batch was written')
    }
    const snapshots = reads.map(item => item.value)
    if (snapshots.some((snapshot, index) => (
      !verifySessionSnapshot(selectedState.selection[index], snapshot, identity.projectRoot)
    ))) {
      throw new Error('SESSION_SAMPLE_CHANGED: at least one selected Session changed after Preview; no Batch was written, preview again')
    }
    const feedback = capability(this.ctx, 'messageFeedback')
    const feedbackObservations = selectedState.parameters.includeFeedback
      ? await Promise.all(selectedState.selection.map(item => readFeedback(feedback, item.rawSessionId)))
      : selectedState.selection.map(() => ({ items: [] }))
    if (selectedState.parameters.includeFeedback) {
      for (let index = 0; index < feedbackObservations.length; index += 1) {
        const expected = selectedState.feedbackSnapshots[index]
        const observed = feedbackObservations[index]
        if (!expected || feedbackDigest(observed) !== expected.digest) {
          throw new Error('SESSION_FEEDBACK_CHANGED: Message Feedback changed after Preview; no Batch was written, preview again')
        }
      }
    }
    const frozenSelections = selectedState.selection.map((item, index) => ({
      ...item,
      events: snapshots[index].events,
    }))
    const observations = frozenSelections.map((item, index) => (
      buildSessionObservation(item, feedbackObservations[index].items)
    ))
    const judgeBinding = selectedState.judgeBinding
    if (!judgeBinding?.provider || !judgeBinding?.model) {
      throw new Error('HISTORICAL_JUDGE_NOT_CONFIRMED: preview again to freeze a valid Judge identity before writing the Batch')
    }
    const batch = buildHistoricalGenerationBatch({
      projectRoot: identity.projectRoot,
      selections: frozenSelections,
      observations,
      limit: selectedState.parameters.limit,
      createdAfter: selectedState.parameters.createdAfter,
      now: this.now(),
    })
    const written = await writePrivateHistoricalBatch({
      projectRoot: identity.projectRoot,
      batch,
      observations,
    })
    const result = await this.runHistoricalEvaluation(
      { ...this.config, projectRoot: identity.projectRoot },
      {
        batchPath: written.batchPath,
        batchDir: written.batchDir,
        jobName: args.jobName,
        judgeBinding,
      },
      this.modelRuntime,
    )
    return {
      schema_version: 1,
      jobKind: 'historical-generation-evaluation',
      executionMode: 'observe-existing',
      promotionEligible: false,
      batch: {
        id: batch.batch_id,
        digest: batch.digest,
        recordCount: batch.records.length,
        path: path.relative(identity.projectRoot, written.batchPath).split(path.sep).join('/'),
      },
      ...result,
    }
  }
}
