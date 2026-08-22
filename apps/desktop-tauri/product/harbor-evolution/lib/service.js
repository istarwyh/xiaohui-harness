import { access } from 'node:fs/promises'
import path from 'node:path'

import {
  readComparison,
  readDashboardSnapshot,
  readDatasetPreview,
  readEvaluatorGovernance,
  readJobDetail,
  readJobProgress,
  readTrialDetail,
  readTrialsPage,
} from './dashboard.js'
import {
  compareCandidates,
  initializeProject,
  inspectEvaluator,
  previewContext,
  readEvaluation,
  runDoctor,
  runEvaluation,
  snapshot,
  updateEvaluator,
  validateDataset,
} from './evolution.js'

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
  constructor(config, metadata = {}) {
    this.config = config
    this.metadata = metadata
  }

  snapshot(args) {
    return snapshot(this.config, args)
  }

  initialize(args) {
    return initializeProject(this.config, args)
  }

  run(args) {
    return runEvaluation(this.config, args)
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

  doctor(args) {
    return runDoctor(this.config, args)
  }

  validateDataset(args) {
    return validateDataset(this.config, args)
  }

  previewContext(args) {
    return previewContext(this.config, args)
  }

  dashboard() {
    return readDashboardSnapshot(this.config, this.metadata)
  }

  job(args) {
    return readJobDetail(this.config, args)
  }

  trials(args) {
    return readTrialsPage(this.config, args)
  }

  trial(args) {
    return readTrialDetail(this.config, args)
  }

  dataset(args) {
    return readDatasetPreview(this.config, args)
  }

  progress(args) {
    return readJobProgress(this.config, args)
  }

  comparison(args) {
    return readComparison(this.config, args)
  }

  async governance(args) {
    const governance = await readEvaluatorGovernance(this.config, args)
    try {
      const stackPath = await resolveEvaluatorStackPath(this.config, governance, args.stackPath)
      governance.evaluatorInterface = await inspectEvaluator(this.config, { ...args, stackPath })
      governance.editingPolicy.browserWriteEnabled = true
      governance.editingPolicy.stackPath = governance.evaluatorInterface.stack?.path
      governance.editingPolicy.saveBehavior = 'Update one descriptor-authorized file with optimistic concurrency and create new Evaluator and Stack identities.'
    } catch (error) {
      governance.evaluatorInterface = { error: error instanceof Error ? error.message : String(error) }
    }
    return governance
  }

  evaluator(args) {
    return updateEvaluator(this.config, args)
  }

  evaluatorInspect(args) {
    return inspectEvaluator(this.config, args)
  }
}
