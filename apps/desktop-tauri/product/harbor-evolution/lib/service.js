import { access, stat } from 'node:fs/promises'
import path from 'node:path'

import { loadModelBinding } from './candidate.js'

import {
  discoverWorkspaceConfigs,
  readComparison,
  readDashboardSnapshot,
  readDatasetPreview,
  readEvaluatorGovernance,
  readJobDetail,
  readJobProgress,
  readMetaEvaluation,
  readTrialDetail,
  readTrialsPage,
} from './dashboard.js'
import {
  compareCandidates,
  initializeGroundTruth,
  initializeProject,
  initializeQuickDiagnostic,
  inspectEvaluator,
  previewContext,
  readEvaluation,
  runDoctor,
  runEvaluation,
  runMetaEvaluation,
  snapshot,
  updateEvaluator,
  validateDataset,
  resolveWithin,
} from './evolution.js'
import { createVersionChecker } from './version.js'

export async function resolveEvaluatorStackPath(config, governance, explicitPath) {
  if (explicitPath) return explicitPath
  const root = path.resolve(config.projectRoot)
  const entry = governance.components?.evaluator?.entry
  if (typeof entry !== 'string' || !entry) return undefined
  let directory = path.dirname(path.resolve(root, entry))
  if (directory !== root && !directory.startsWith(`${root}${path.sep}`)) return undefined
  while (directory === root || directory.startsWith(`${root}${path.sep}`)) {
    const candidate = path.join(directory, '.harbor', 'evaluation-stack.yml')
    try {
      await access(candidate)
      return path.relative(root, candidate)
    } catch {}
    if (directory === root) break
    directory = path.dirname(directory)
  }
  return undefined
}

/** One Host-side boundary shared by Agent tools and the Web dashboard. */
export class EvolutionService {
  constructor(config, metadata = {}, modelRuntime) {
    this.config = { jobsDir: 'jobs', ...config }
    this.metadata = metadata
    this.modelRuntime = modelRuntime
    this.versionChecker = metadata.versionChecker ?? createVersionChecker()
    this.projectRoots = new Map()
    this.workspaceConfigs = new Map()
    this.activeProjectRoot = path.resolve(this.config.projectRoot)
    this._registerProjectRoot(this.activeProjectRoot, metadata.projectRootSource ?? 'configured')
  }

  _registerProjectRoot(projectRoot, source) {
    const resolved = path.resolve(projectRoot)
    this.projectRoots.set(resolved, { projectRoot: resolved, source, activatedAt: new Date().toISOString() })
    this.activeProjectRoot = resolved
    return this.projectRoots.get(resolved)
  }

  async _refreshWorkspaces() {
    const discovered = []
    this.workspaceConfigs.clear()
    for (const [identity, root] of this.projectRoots.entries()) {
      try {
        const details = await stat(root.projectRoot)
        if (!details.isDirectory()) throw new Error('not a directory')
      } catch {
        this.projectRoots.delete(identity)
        continue
      }
      const configs = await discoverWorkspaceConfigs({ ...this.config, projectRoot: root.projectRoot })
      for (const config of configs) {
        const value = { ...config, projectRootSource: root.source }
        this.workspaceConfigs.set(config.workspaceId, value)
        discovered.push(value)
      }
    }
    return discovered
  }

  async _webContext(args = {}) {
    const workspaces = await this._refreshWorkspaces()
    const requested = String(args.workspace ?? '').trim()
    let config = requested ? this.workspaceConfigs.get(requested) : undefined
    if (requested && !config) throw new Error('Workspace is unavailable; reload Harbor and select an active workspace')
    config ??= workspaces.find(item => item.projectRoot === this.activeProjectRoot && item.workspaceRoot === '.')
      ?? workspaces.find(item => item.projectRoot === this.activeProjectRoot)
      ?? workspaces[0]
    if (!config) throw new Error('No Harbor workspace is available')
    return { config, workspaces }
  }

  snapshot(args) {
    return snapshot(this.config, args)
  }

  initialize(args) {
    return initializeProject(this.config, args)
  }

  quickDiagnostic(args) {
    return initializeQuickDiagnostic(this.config, args)
  }

  async _resolveCandidateModel(args) {
    const candidatePath = resolveWithin(
      this.config.projectRoot,
      args.candidatePath,
      'candidatePath',
    )
    const pinnedBinding = await loadModelBinding(candidatePath)
    return this.modelRuntime.resolve(args, pinnedBinding)
  }

  async run(args) {
    const candidateModelBinding = await this._resolveCandidateModel(args)
    return runEvaluation(this.config, { ...args, candidateModelBinding }, this.modelRuntime)
  }

  result(args) {
    const job = String(args.jobPath ?? '').split(/[\\/]/).filter(Boolean).at(-1)
    if (args.view === 'job') return readJobDetail(this.config, { job })
    if (args.view === 'progress') return readJobProgress(this.config, { job, since: args.since })
    if (args.view === 'trial') {
      if (!args.trialId) throw new Error('trialId is required when view=trial')
      return readTrialDetail(this.config, { job, trial: args.trialId })
    }
    if (args.view === 'dataset') return readDatasetPreview(this.config, { job })
    if (args.view === 'governance') return readEvaluatorGovernance(this.config, { job, compareJob: args.compareJob })
    return readEvaluation(this.config, args)
  }

  compare(args) {
    return compareCandidates(this.config, args)
  }

  async doctor(args) {
    const candidateModelBinding = await this._resolveCandidateModel(args)
    const result = await runDoctor(this.config, args)
    return { ...result, candidate_model_binding: candidateModelBinding }
  }

  validateDataset(args) {
    return validateDataset(this.config, args)
  }

  async previewContext(args) {
    const candidateModelBinding = await this._resolveCandidateModel(args)
    return previewContext(this.config, { ...args, candidateModelBinding })
  }

  async dashboard(args = {}) {
    const { config, workspaces } = await this._webContext(args)
    return readDashboardSnapshot(config, {
      ...this.metadata,
      projectRootSource: config.projectRootSource,
      workspaces: workspaces.map(item => ({
        id: item.workspaceId,
        label: item.workspaceLabel,
        root: item.workspaceRoot,
        projectRoot: item.projectRoot,
        jobsDir: item.jobsDir,
        stackPath: item.stackPath,
        source: item.projectRootSource,
      })),
    }, args)
  }

  async version(args = {}) {
    let config = this.config
    if (args.workspace) ({ config } = await this._webContext(args))
    else {
      try { ({ config } = await this._webContext(args)) } catch {}
    }
    return this.versionChecker({
      currentVersion: this.metadata.pluginVersion ?? 'development',
      projectRoot: config.projectRoot,
      refresh: args.refresh === true || args.refresh === 'true',
    })
  }

  async modelBinding() {
    const binding = await this.modelRuntime.currentBinding()
    return {
      schema_version: 1,
      scope: 'new-candidate',
      candidate_model_binding: binding,
      transport: 'dsh-host-broker',
      protocol: 'dsh-host-model-gateway/v1',
      credentials: {
        mode: 'host-broker-only',
        note: 'The Candidate receives only a short-lived Job capability. Host OAuth and API credentials never enter the Candidate or Harbor artifacts.',
      },
      note: 'Write candidate_model_binding to model-binding.json before snapshotting. Later chat-model changes do not rewrite this Candidate.',
    }
  }

  activateProjectRoot(requested, source = 'agent-session') {
    if (!path.isAbsolute(requested)) throw new Error('projectRoot must be an absolute directory path')
    const resolved = path.resolve(requested)
    this._registerProjectRoot(resolved, source)
    return {
      projectRoot: resolved,
      reloaded: true,
      source,
      scope: 'Web Workbench only; Agent tools remain isolated to each calling session working directory.',
    }
  }

  async setProjectRoot(args) {
    const requested = String(args?.projectRoot ?? '').trim()
    if (!path.isAbsolute(requested)) throw new Error('projectRoot must be an absolute directory path')
    const resolved = path.resolve(requested)
    const details = await stat(resolved)
    if (!details.isDirectory()) throw new Error('projectRoot must point to an existing directory')
    return this.activateProjectRoot(resolved, 'manual')
  }

  async job(args) {
    const { config } = await this._webContext(args)
    return readJobDetail(config, args)
  }

  async trials(args) {
    const { config } = await this._webContext(args)
    return readTrialsPage(config, args)
  }

  async trial(args) {
    const { config } = await this._webContext(args)
    return readTrialDetail(config, args)
  }

  async dataset(args) {
    const { config } = await this._webContext(args)
    return readDatasetPreview(config, args)
  }

  async progress(args) {
    const { config } = await this._webContext(args)
    return readJobProgress(config, args)
  }

  async comparison(args) {
    const { config } = await this._webContext(args)
    return readComparison(config, args)
  }

  async governance(args) {
    const { config } = await this._webContext(args)
    const governance = await readEvaluatorGovernance(config, args)
    try {
      const stackPath = await resolveEvaluatorStackPath(config, governance, args.stackPath)
      const current = await inspectEvaluator(config, { ...args, stackPath })
      const historicalEvaluator = governance.components?.evaluator
      const identityMatches = current.stack?.id === governance.stackIdentity.id
        && current.stack?.version === governance.stackIdentity.version
        && current.evaluator?.evaluator_id === historicalEvaluator?.id
        && current.evaluator?.version === historicalEvaluator?.version
        && current.evaluator?.digest === historicalEvaluator?.digest
      if (!identityMatches) {
        governance.evaluatorInterface = {
          error: 'The live Evaluator no longer matches this historical Job. Historical sources remain readable, but editing is disabled until you open a Job with the current Stack identity.',
        }
        governance.editingPolicy.identityMatch = false
      } else {
        governance.evaluatorInterface = current
        governance.editingPolicy.browserWriteEnabled = true
        governance.editingPolicy.identityMatch = true
        governance.editingPolicy.stackPath = current.stack?.path
        governance.editingPolicy.saveBehavior = 'Update one descriptor-authorized file with optimistic concurrency and create new Evaluator and Stack identities.'
      }
    } catch (error) {
      governance.evaluatorInterface = { error: error instanceof Error ? error.message : String(error) }
      governance.editingPolicy.identityMatch = false
    }
    return governance
  }

  async evaluator(args) {
    const config = args.workspace ? (await this._webContext(args)).config : this.config
    return updateEvaluator(config, args)
  }

  evaluatorInspect(args) {
    return inspectEvaluator(this.config, args)
  }

  groundTruthInitialize(args) {
    return initializeGroundTruth(this.config, args)
  }

  evaluatorMetaEvaluate(args) {
    return runMetaEvaluation(this.config, args)
  }

  async meta(args) {
    const { config } = await this._webContext(args)
    const governance = await readEvaluatorGovernance(config, args)
    const stackPath = await resolveEvaluatorStackPath(config, governance, args.stackPath)
    if (!stackPath) return readMetaEvaluation(config, args)
    const stackDirectory = path.dirname(path.resolve(config.projectRoot, stackPath))
    const evaluationRoot = path.dirname(stackDirectory)
    return readMetaEvaluation(config, {
      ...args,
      evaluationRoot: path.relative(config.projectRoot, evaluationRoot),
    })
  }
}
