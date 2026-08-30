import { access, constants, lstat, readdir, readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

import { resolveWithin } from './evolution.js'

const SUMMARY_NAME = 'evaluation-summary.json'
const HISTORICAL_COMPLETION_NAME = 'historical-evaluation-complete.json'
const DEFAULT_JOB_PAGE_SIZE = 20
const MAX_JOB_PAGE_SIZE = 100
const MAX_JSON_BYTES = 2 * 1024 * 1024
const MAX_SOURCE_BYTES = 128 * 1024
const MAX_PREVIEW_BYTES = 512 * 1024
const MAX_TRIAL_LIMIT = 100
const jsonCache = new Map()
const SENSITIVE_KEY = /authorization|cookie|token|api[_-]?key|secret|password|request[_-]?headers/i
const SENSITIVE_SOURCE_VALUE = /(authorization|cookie|token|api[_-]?key|secret|password)\s*[:=]\s*([^\s,;]+)/gi
const WORKSPACE_SKIP_DIRECTORIES = new Set([
  '.cache', '.git', '.harbor', '.next', '.venv', '__pycache__',
  'build', 'candidates', 'coverage', 'datasets', 'dist', 'jobs', 'node_modules', 'public', 'vendor', 'venv',
])
const MAX_WORKSPACE_DEPTH = 5

function safeSegment(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(String(value ?? ''))) throw new Error(`${label} is invalid`)
  return String(value)
}

function redact(value, depth = 0, maxText = 8_000) {
  if (depth > 10) return '[TRUNCATED depth]'
  if (Array.isArray(value)) return value.slice(0, 10_000).map(item => redact(item, depth + 1, maxText))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1, maxText)]))
  }
  if (typeof value === 'string' && value.length > maxText) return `${value.slice(0, maxText)}\n[TRUNCATED ${value.length - maxText} chars]`
  return value
}

async function readJson(file, { maxBytes = MAX_JSON_BYTES, maxText = 8_000 } = {}) {
  try {
    const details = await lstat(file)
    if (details.isSymbolicLink()) return { __readError: `${path.basename(file)} may not be a symlink` }
    if (!details.isFile()) return { __readError: `${path.basename(file)} is not a file` }
    if (details.size > maxBytes) return { __readError: `${path.basename(file)} exceeds ${maxBytes} bytes` }
    const cached = jsonCache.get(file)
    const identity = `${details.mtimeMs}:${details.size}:${maxText}`
    if (cached?.identity === identity) return cached.value
    const value = redact(JSON.parse(await readFile(file, 'utf8')), 0, maxText)
    jsonCache.set(file, { identity, value })
    return value
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) return { __readError: `invalid JSON in ${path.basename(file)}` }
    throw error
  }
}

async function readSafeText(file, projectRoot) {
  const resolved = path.resolve(file)
  const root = path.resolve(projectRoot)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return { error: 'source is outside projectRoot' }
  try {
    const details = await lstat(resolved)
    if (!details.isFile() || details.isSymbolicLink()) return { error: 'source is not a safe file' }
    if (details.size > MAX_SOURCE_BYTES) return { error: `source exceeds ${MAX_SOURCE_BYTES} bytes` }
    const text = (await readFile(resolved, 'utf8')).replace(SENSITIVE_SOURCE_VALUE, '$1=[REDACTED]')
    return { text: redact(text) }
  } catch (error) {
    return { error: error.code === 'ENOENT' ? 'source is unavailable' : 'source is unreadable' }
  }
}

async function directoryCheck(directory, { optional = false } = {}) {
  try {
    const details = await lstat(directory)
    if (details.isSymbolicLink() || !details.isDirectory()) return { status: 'error', detail: 'not a safe directory' }
    await access(directory, constants.R_OK)
    return { status: 'ok', detail: 'readable' }
  } catch (error) {
    if (optional && error.code === 'ENOENT') return { status: 'warning', detail: 'not created yet' }
    return { status: 'error', detail: error.code === 'ENOENT' ? 'not found' : 'not readable' }
  }
}

async function fileCheck(file) {
  try {
    const details = await lstat(file)
    return details.isFile() && !details.isSymbolicLink()
      ? { status: 'ok', detail: path.basename(file) }
      : { status: 'error', detail: 'not a safe file' }
  } catch (error) {
    return { status: 'error', detail: error.code === 'ENOENT' ? 'not found' : 'not readable' }
  }
}

async function executableCheck(command) {
  if (!command) return { status: 'error', detail: 'not configured' }
  if (!path.isAbsolute(command)) return { status: 'ok', detail: `${command} (PATH)` }
  try {
    await access(command, constants.X_OK)
    return { status: 'ok', detail: path.basename(command) }
  } catch (error) {
    return { status: 'error', detail: error.code === 'ENOENT' ? 'not found' : 'not executable' }
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const CANDIDATE_JOB_KIND = 'candidate-evaluation'
const HISTORICAL_JOB_KIND = 'historical-generation-evaluation'

function normalizedJobKind(summary, context) {
  const declared = summary?.job_kind ?? context?.job_kind
  if (typeof declared === 'string' && declared) return declared
  if (context?.protocol === 'historical-generation-evaluation-context/v1') return HISTORICAL_JOB_KIND
  return CANDIDATE_JOB_KIND
}

function coverageView(summary) {
  if (isObject(summary?.coverage)) return summary.coverage
  const total = Number(summary?.n_trials ?? 0)
  const scored = Number(summary?.scored_trial_count ?? summary?.n_valid_scores ?? 0)
  const unscored = Number(
    summary?.unscored_trial_count
    ?? summary?.status_counts?.['completed-unscored']
    ?? 0,
  )
  return {
    scored_trials: scored,
    unscored_trials: unscored,
    total_trials: total,
    trial_rate: total ? scored / total : undefined,
  }
}

function evaluatorMetaEvaluation(summary, context) {
  return summary?.evaluator_meta_evaluation
    ?? context?.downstream_analysis?.evaluator_meta_evaluation
    ?? (normalizedJobKind(summary, context) === HISTORICAL_JOB_KIND
      ? { status: 'not-run', validation_report_ref: null }
      : undefined)
}

function capabilityMap(summary, context, lifecycle, registry, stack) {
  const jobKind = normalizedJobKind(summary, context)
  const historicalGeneration = jobKind === HISTORICAL_JOB_KIND
  const contextV2 = context?.schema_version === 2
  const historicalContext = context?.schema_version === 1
    && context?.protocol === 'historical-generation-evaluation-context/v1'
  const scoreValidity = summary?.schema_version === 3
    || summary?.schema_version === 4
  return {
    jobKind,
    contextV2,
    contextSupported: contextV2 || historicalContext,
    historicalGeneration,
    candidateEvaluation: !historicalGeneration,
    trialLifecycle: lifecycle?.schema_version === 1,
    scoreValidity,
    evidenceProvenance: scoreValidity,
    artifactRegistry: [1, 2].includes(registry?.schema_version),
    source: historicalGeneration,
    compare: contextV2 && !historicalGeneration,
    evaluatorGovernance: stack?.schema_version === 1,
    evaluatorMetaEvaluation: evaluatorMetaEvaluation(summary, context),
    gate: contextV2 && !historicalGeneration && summary?.mode === 'promotion-eligible',
    readOnlyLegacy: !contextV2 && !historicalContext,
  }
}

function primaryMetric(summary, contract) {
  const name = contract?.primary_metric
  if (name && typeof summary?.metrics?.[name] === 'number') return { name, value: summary.metrics[name] }
  const entry = Object.entries(summary?.metrics ?? {}).find(([, value]) => typeof value === 'number')
  return entry ? { name: entry[0], value: entry[1] } : undefined
}

function progressView(summary, lifecycle, updatedAt) {
  const total = Number(lifecycle?.dataset_total ?? summary?.n_trials ?? summary?.coverage?.total_trials ?? 0)
  const lifecycleTrials = selectedLifecycleTrials(lifecycle)
  const completed = lifecycle
    ? lifecycleTrials.filter(item => item.terminal).length
    : Number(summary?.n_completed_trials ?? summary?.n_discovered_trials ?? summary?.n_trials ?? 0)
  const active = lifecycle ? lifecycleTrials.some(item => !item.terminal) : !summary
  const lastProgressAt = lifecycle?.updated_at ?? updatedAt
  const ageMs = Math.max(0, Date.now() - Date.parse(lastProgressAt || updatedAt))
  const errorCount = Number(summary?.n_infrastructure_exceptions ?? 0) + Number(summary?.n_evaluation_exceptions ?? 0)
  const health = errorCount > 0 ? 'attention' : active && ageMs > 60_000 ? 'stalled' : active ? 'healthy' : 'completed'
  return {
    total,
    completed: Math.min(completed, total || completed),
    active,
    percent: total ? Math.min(100, Math.round((completed / total) * 100)) : 0,
    lastProgressAt,
    health,
  }
}

const HISTORICAL_COVERAGE_KEYS = [
  'scored_trials', 'unscored_trials', 'total_trials', 'trial_rate',
  'criterion_scored', 'criterion_total', 'criterion_rate',
]

function historicalCompletionValid(summary, completion, jobName) {
  return (
    summary?.schema_version === 4
    && summary?.job === jobName
    && summary?.job_kind === HISTORICAL_JOB_KIND
    && summary?.mode === 'diagnostic'
    && summary?.execution_mode === 'observe-existing'
    && summary?.artifact_validation?.valid === true
    && summary?.candidate === undefined
    && completion?.schema_version === 1
    && completion?.job_kind === HISTORICAL_JOB_KIND
    && completion?.status === 'completed'
    && completion?.valid === true
    && completion?.job === jobName
    && completion?.summary_path === SUMMARY_NAME
    && completion?.artifact_registry_path === 'artifact-registry.json'
    && HISTORICAL_COVERAGE_KEYS.every(key => (
      typeof summary?.coverage?.[key] === 'number'
      && summary.coverage[key] === completion?.coverage?.[key]
    ))
  )
}

function jobStatus(summary, lifecycle, progress, jobKind, completion, jobName) {
  if (summary?.__readError) return 'failed'
  if (!summary && !lifecycle) return 'pending'
  if (progress.active) return 'running'
  if (!summary && lifecycle) return 'running'
  if (summary?.artifact_validation?.valid === false) return 'failed'
  if (
    jobKind === HISTORICAL_JOB_KIND
    && !historicalCompletionValid(summary, completion, jobName)
  ) return 'failed'
  if (Number(summary.n_infrastructure_exceptions ?? summary.n_exceptions ?? 0) > 0 || Number(summary.n_evaluation_exceptions ?? 0) > 0) return 'partial'
  const invalidScores = Number(summary.n_invalid_scores ?? 0)
  if (invalidScores > 0) return 'attention'
  return 'completed'
}

async function readJob(jobsDir, entry, details) {
  const directory = path.join(jobsDir, entry.name)
  const [summary, contextFile, promotion, contract, lifecycle, registry, stack, completion] = await Promise.all([
    readJson(path.join(directory, SUMMARY_NAME)),
    readJson(path.join(directory, 'evaluation-context.json')),
    readJson(path.join(directory, 'promotion-report.json')),
    readJson(path.join(directory, 'evaluation-contract.json')),
    readJson(path.join(directory, 'trial-lifecycle.json')),
    readJson(path.join(directory, 'artifact-registry.json')),
    readJson(path.join(directory, 'evaluation-stack-manifest.json')),
    readJson(path.join(directory, HISTORICAL_COMPLETION_NAME)),
  ])
  const evaluationContext = summary?.evaluation_context ?? contextFile
  if (!evaluationContext && !summary && !lifecycle) return undefined
  const updatedAt = details.mtime.toISOString()
  const progress = progressView(summary, lifecycle, updatedAt)
  const jobKind = normalizedJobKind(summary, evaluationContext)
  const capabilities = capabilityMap(summary, evaluationContext, lifecycle, registry, stack)
  const evaluationTarget = summary?.evaluation_target ?? evaluationContext?.evaluation_target
  const generationSource = summary?.generation_source ?? evaluationContext?.generation_source
  const coverage = coverageView(summary)
  return {
    name: entry.name,
    updatedAt,
    status: jobStatus(summary, lifecycle, progress, jobKind, completion, entry.name),
    jobKind,
    mode: summary?.mode ?? evaluationContext?.mode,
    executionMode: summary?.execution_mode ?? evaluationContext?.execution_mode,
    nTrials: progress.total,
    nDiscoveredTrials: Number(summary?.n_discovered_trials ?? lifecycle?.attempt_count ?? 0),
    nValidScores: summary?.n_valid_scores,
    nInvalidScores: summary?.n_invalid_scores,
    nUnscoredTrials: Number(coverage.unscored_trials ?? 0),
    nExceptions: Number(summary?.n_exceptions ?? 0),
    primaryMetric: primaryMetric(summary, contract),
    metrics: summary?.metrics ?? {},
    candidate: summary?.candidate ?? evaluationContext?.candidate,
    evaluationTarget,
    generationSource,
    generatorPopulation: evaluationTarget?.generator_population,
    coverage,
    evaluatorMetaEvaluation: evaluatorMetaEvaluation(summary, evaluationContext),
    dataset: evaluationContext?.dataset,
    evaluationContext,
    progress,
    capabilities,
    artifactValidation: summary?.artifact_validation,
    promotion: promotion ? { decision: promotion.decision, reasons: promotion.reasons ?? [], baselineJob: promotion.baseline_job } : undefined,
    readError: summary?.__readError,
  }
}

async function listJobs(jobsDir, { offset = 0, limit = DEFAULT_JOB_PAGE_SIZE } = {}) {
  let entries
  try {
    entries = await readdir(jobsDir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return { items: [], total: 0, offset, limit, hasMore: false }
    throw error
  }
  const directories = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
  const recent = await Promise.all(directories.map(async entry => ({ entry, details: await stat(path.join(jobsDir, entry.name)) })))
  recent.sort((left, right) => right.details.mtimeMs - left.details.mtimeMs)
  const page = recent.slice(offset, offset + limit)
  const jobs = await Promise.all(page.map(({ entry, details }) => readJob(jobsDir, entry, details)))
  return { items: jobs.filter(Boolean), total: recent.length, offset, limit, hasMore: offset + limit < recent.length }
}

function relativePath(root, value) {
  return path.relative(root, value).split(path.sep).join('/') || '.'
}

function workspaceIdentity(projectRoot, workspaceRoot, jobsDir, preferred) {
  const digest = createHash('sha256').update(`${projectRoot}\0${workspaceRoot}\0${jobsDir}`).digest('hex').slice(0, 12)
  const label = String(preferred || path.basename(workspaceRoot) || 'root').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'root'
  return `${label}-${digest}`
}

async function regularFile(pathname) {
  try {
    const details = await lstat(pathname)
    return details.isFile() && !details.isSymbolicLink()
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

/** Discover root and namespaced Harbor workspaces without interpreting YAML. */
export async function discoverWorkspaceConfigs(config) {
  const projectRoot = path.resolve(config.projectRoot)
  const found = []
  async function visit(directory, depth) {
    const harborDirectory = path.join(directory, '.harbor')
    const descriptorPath = path.join(harborDirectory, 'workspace.json')
    const stackPath = path.join(harborDirectory, 'evaluation-stack.yml')
    const descriptor = await readJson(descriptorPath)
    if (descriptor?.schema_version === 1 && descriptor.jobs && descriptor.stack) {
      const jobs = relativePath(projectRoot, resolveWithin(projectRoot, path.resolve(directory, descriptor.jobs), 'workspace.jobs'))
      const stack = relativePath(projectRoot, resolveWithin(projectRoot, path.resolve(directory, descriptor.stack), 'workspace.stack'))
      const workspaceRoot = relativePath(projectRoot, directory)
      found.push({
        ...config,
        jobsDir: jobs,
        stackPath: stack,
        workspaceRoot,
        workspaceLabel: descriptor.workspace_id ?? workspaceRoot,
        workspaceId: workspaceIdentity(projectRoot, directory, jobs, descriptor.workspace_id),
      })
    } else if (await regularFile(stackPath)) {
      const workspaceRoot = relativePath(projectRoot, directory)
      const jobs = relativePath(projectRoot, path.join(directory, 'jobs'))
      found.push({
        ...config,
        jobsDir: jobs,
        stackPath: relativePath(projectRoot, stackPath),
        workspaceRoot,
        workspaceLabel: workspaceRoot,
        workspaceId: workspaceIdentity(projectRoot, directory, jobs, workspaceRoot),
      })
    }
    if (depth >= MAX_WORKSPACE_DEPTH) return
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EACCES') return
      throw error
    }
    await Promise.all(entries
      .filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !WORKSPACE_SKIP_DIRECTORIES.has(entry.name))
      .map(entry => visit(path.join(directory, entry.name), depth + 1)))
  }
  await visit(projectRoot, 0)
  if (!found.some(item => item.workspaceRoot === '.')) {
    found.unshift({
      ...config,
      stackPath: '.harbor/evaluation-stack.yml',
      workspaceRoot: '.',
      workspaceLabel: path.basename(projectRoot) || 'root',
      workspaceId: workspaceIdentity(projectRoot, projectRoot, config.jobsDir, path.basename(projectRoot)),
    })
  }
  return found.sort((left, right) => left.workspaceRoot.localeCompare(right.workspaceRoot))
}

function jobsDirectory(config) {
  return resolveWithin(path.resolve(config.projectRoot), config.jobsDir, 'jobsDir')
}

function jobDirectory(config, job) {
  return path.join(jobsDirectory(config), safeSegment(job, 'job'))
}

export async function readDashboardSnapshot(config, metadata = {}, args = {}) {
  const projectRoot = path.resolve(config.projectRoot)
  const jobsDir = jobsDirectory(config)
  const offset = Math.max(0, Number.parseInt(args.offset ?? 0, 10) || 0)
  const limit = Math.min(MAX_JOB_PAGE_SIZE, Math.max(1, Number.parseInt(args.limit ?? DEFAULT_JOB_PAGE_SIZE, 10) || DEFAULT_JOB_PAGE_SIZE))
  const [jobPage, projectRootCheck, jobsDirCheck, harborCheck, harborDshCheck, stackCheck] = await Promise.all([
    listJobs(jobsDir, { offset, limit }),
    directoryCheck(projectRoot),
    directoryCheck(jobsDir, { optional: true }),
    executableCheck(config.harborBin),
    executableCheck(config.harborDshBin),
    fileCheck(resolveWithin(projectRoot, config.stackPath ?? '.harbor/evaluation-stack.yml', 'stackPath')),
  ])
  const jobs = jobPage.items
  const counts = jobs.reduce((result, job) => ({ ...result, [job.status]: (result[job.status] ?? 0) + 1 }), {})
  const latestMetric = jobs.find(job => job.primaryMetric)?.primaryMetric
  return {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    pluginVersion: metadata.pluginVersion ?? 'development',
    workspace: { id: config.workspaceId, label: config.workspaceLabel, root: config.workspaceRoot ?? '.', stackPath: config.stackPath },
    workspaces: metadata.workspaces ?? [],
    config: { projectRoot, projectRootSource: metadata.projectRootSource ?? 'configured', jobsDir: config.jobsDir, runtimePolicy: config.runtimePolicy ?? 'follow-latest', agentImportPath: config.agentImportPath, pluginImportPath: config.pluginImportPath },
    checks: { projectRoot: projectRootCheck, jobsDir: jobsDirCheck, harbor: harborCheck, harborDsh: harborDshCheck, evaluationStack: stackCheck },
    overview: {
      totalJobs: jobPage.total,
      visibleJobs: jobs.length,
      completedJobs: (counts.completed ?? 0) + (counts.partial ?? 0) + (counts.attention ?? 0),
      activeJobs: (counts.pending ?? 0) + (counts.running ?? 0),
      failedJobs: counts.failed ?? 0,
      latestMetric,
    },
    jobPagination: { offset: jobPage.offset, limit: jobPage.limit, total: jobPage.total, hasMore: jobPage.hasMore },
    jobs,
  }
}

const DETAIL_ARTIFACTS = {
  summary: 'evaluation-summary.json',
  candidate: 'candidate-manifest.json',
  dataset: 'dataset-manifest.json',
  datasetPreview: 'dataset-preview.json',
  stack: 'evaluation-stack-manifest.json',
  stackSources: 'evaluation-stack-sources.json',
  context: 'evaluation-context.json',
  contract: 'evaluation-contract.json',
  doctor: 'architecture-doctor.json',
  population: 'population-report.json',
  lifecycle: 'trial-lifecycle.json',
  registry: 'artifact-registry.json',
  diagnosis: 'diagnosis-report.json',
  optimization: 'optimization-report.json',
  promotion: 'promotion-report.json',
  completion: HISTORICAL_COMPLETION_NAME,
}

function schemaIssue(key, value) {
  if (value === undefined) return undefined
  if (value?.__readError) return value.__readError
  if (!isObject(value)) return 'artifact must be an object'
  const versions = {
    summary: [2, 3, 4], candidate: [1], dataset: [1], datasetPreview: [1], stack: [1], stackSources: [1], context: [1, 2], contract: [1],
    doctor: [1], population: [1, 2, 3], lifecycle: [1], registry: [1, 2], diagnosis: [1, 2], optimization: [1, 2, 3], promotion: [2], completion: [1],
  }[key]
  if (versions && !versions.includes(value.schema_version)) return `schema_version must be one of ${versions.join(', ')}`
  const required = {
    summary: ['job', 'metrics'], candidate: ['candidate_id', 'version', 'digest'], dataset: ['dataset_id', 'version', 'source_digest', 'tasks'], datasetPreview: ['dataset_id', 'version', 'source_digest', 'tasks'],
    stack: ['stack_id', 'version', 'digest', 'components', 'judge'], stackSources: ['stack_digest', 'components'], context: ['digest'], contract: ['contract_id', 'version', 'primary_metric', 'metrics'],
    doctor: ['promotion_ready', 'findings'], population: ['population_size', 'groups', 'metrics'], lifecycle: ['dataset_total', 'trials'],
    registry: ['artifacts'], diagnosis: ['diagnoses'], optimization: ['hypotheses'], promotion: ['decision', 'reasons', 'policy_digest'],
    completion: ['job_kind', 'status', 'valid', 'job', 'summary_path', 'artifact_registry_path', 'coverage'],
  }[key] ?? []
  const requiredFields = key === 'population' && value.schema_version === 3
    ? ['population_size', 'coverage', 'metrics']
    : required
  const missing = requiredFields.filter(field => value[field] === undefined)
  return missing.length ? `missing fields: ${missing.join(', ')}` : undefined
}

export async function readJobDetail(config, args) {
  const job = safeSegment(args.job, 'job')
  const directory = jobDirectory(config, job)
  const check = await directoryCheck(directory)
  if (check.status !== 'ok') throw new Error('Job not found')
  const values = await Promise.all(Object.values(DETAIL_ARTIFACTS).map(name => readJson(path.join(directory, name))))
  const artifacts = Object.fromEntries(Object.keys(DETAIL_ARTIFACTS).map((key, index) => [key, values[index]]))
  if (artifacts.summary && !artifacts.summary.__readError) {
    const { trials: _trials, ...lightSummary } = artifacts.summary
    artifacts.summary = lightSummary
  }
  const validation = Object.fromEntries(Object.entries(artifacts).map(([key, value]) => {
    const issue = schemaIssue(key, value)
    return [key, value === undefined ? { status: 'unavailable', reason: 'capability-not-produced' } : issue ? { status: 'invalid', error: issue } : { status: 'valid' }]
  }))
  const context = artifacts.context ?? values[Object.keys(DETAIL_ARTIFACTS).indexOf('context')]
  const summary = values[Object.keys(DETAIL_ARTIFACTS).indexOf('summary')]
  const jobKind = normalizedJobKind(summary, context)
  if (
    jobKind === HISTORICAL_JOB_KIND
    && !historicalCompletionValid(summary, artifacts.completion, job)
  ) {
    validation.completion = {
      status: 'invalid',
      error: 'Historical completion sentinel is missing, stale, or inconsistent with the Summary',
    }
  }
  const capabilities = capabilityMap(
    summary, context, artifacts.lifecycle, artifacts.registry, artifacts.stack,
  )
  const evaluationTarget = summary?.evaluation_target ?? context?.evaluation_target
  return {
    schemaVersion: 3,
    job,
    jobKind,
    evaluationTarget,
    generationSource: summary?.generation_source ?? context?.generation_source,
    generatorPopulation: evaluationTarget?.generator_population,
    executionMode: summary?.execution_mode ?? context?.execution_mode,
    coverage: coverageView(summary),
    evaluatorMetaEvaluation: evaluatorMetaEvaluation(summary, context),
    capabilities,
    artifacts,
    validation,
  }
}

function selectedLifecycleTrials(lifecycle) {
  const selected = new Map()
  for (const trial of lifecycle?.trials ?? []) {
    const key = Number(trial.dataset_order ?? selected.size)
    if (!selected.has(key) || Number(trial.attempt ?? 1) > Number(selected.get(key).attempt ?? 1)) selected.set(key, trial)
  }
  return [...selected.values()].sort((left, right) => Number(left.dataset_order ?? 0) - Number(right.dataset_order ?? 0))
}

function normalizeTrial(trial, order) {
  const score = trial.score ?? { value: undefined, valid: trial.exception ? false : true, invalid_reasons: trial.exception ? ['infrastructure-error'] : [] }
  const datasetOrder = Number(trial.datasetOrder ?? trial.dataset_order ?? order)
  const status = trial.status ?? trial.phase ?? (trial.exception ? 'infrastructure-error' : 'completed')
  return {
    id: trial.id ?? trial.execution_id ?? `dataset-${datasetOrder}`,
    name: trial.name ?? trial.trial_name ?? trial.dataset_trial ?? trial.trial,
    datasetTrial: trial.datasetTrial ?? trial.dataset_trial ?? trial.trial,
    datasetOrder,
    attempt: Number(trial.attempt ?? 1),
    status,
    scoringStatus: status === 'completed-unscored' ? 'unscored' : score.valid ? 'scored' : 'invalid',
    terminal: trial.terminal ?? true,
    updatedAt: trial.updatedAt ?? trial.updated_at,
    score,
    rewards: trial.rewards ?? {},
    requirements: trial.requirements,
    population: trial.population ?? {},
    evidenceAvailable: Boolean(trial.evidenceAvailable ?? trial.terminal),
    exception: trial.exception ? { type: trial.exception.type, classification: trial.exception.classification } : undefined,
  }
}

async function jobTrials(config, job) {
  const directory = jobDirectory(config, job)
  const [summary, lifecycle] = await Promise.all([
    readJson(path.join(directory, SUMMARY_NAME)),
    readJson(path.join(directory, 'trial-lifecycle.json')),
  ])
  if ((!summary || summary.__readError) && (!lifecycle || lifecycle.__readError)) throw new Error('Job progress is unavailable')
  const summaryTrials = (summary?.trials ?? []).map(normalizeTrial)
  if (!lifecycle?.trials) return { trials: summaryTrials, total: Number(summary?.n_trials ?? summaryTrials.length), lifecycle }
  const byExecution = new Map(summaryTrials.map(item => [String(item.id), item]))
  const byDataset = new Map(summaryTrials.map(item => [String(item.datasetTrial), item]))
  const trials = selectedLifecycleTrials(lifecycle).map((item, index) => {
    const evaluated = byExecution.get(String(item.execution_id)) ?? byDataset.get(String(item.dataset_trial))
    return normalizeTrial({ ...item, ...evaluated, dataset_order: item.dataset_order, attempt: item.attempt }, index)
  })
  return { trials, total: Number(lifecycle.dataset_total ?? summary?.n_trials ?? trials.length), lifecycle }
}

function datasetTaskAliases(task) {
  const values = [task?.id, task?.path, task?.metadata?.task_name]
  const aliases = new Set()
  for (const value of values) {
    const normalized = String(value ?? '').trim().replace(/^\/+|\/+$/g, '')
    if (!normalized || normalized === '.') continue
    aliases.add(normalized)
    aliases.add(normalized.split('/').at(-1))
  }
  return aliases
}

function taskDisplayName(task) {
  const direct = task?.query ?? task?.metadata?.query
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  if (typeof task?.instruction === 'string') {
    const lines = task.instruction.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
    const labeled = lines.find(line => /^(?:query|question|问题|任务)\s*[:：]/i.test(line))
    const text = (labeled ?? lines[0] ?? '').replace(/^(?:query|question|问题|任务)\s*[:：]\s*/i, '')
    if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text
  }
  return String(task?.id ?? task?.path ?? '')
}

async function enrichTrialsWithDataset(config, job, trials) {
  let preview
  try { preview = await readDatasetPreview(config, { job }) } catch { return trials }
  const byAlias = new Map()
  for (const [datasetOrder, task] of (preview?.tasks ?? []).entries()) {
    for (const alias of datasetTaskAliases(task)) byAlias.set(alias, { task, datasetOrder })
  }
  return trials.map(trial => {
    const normalized = String(trial.datasetTrial ?? '').replace(/^\/+|\/+$/g, '')
    const matched = byAlias.get(normalized) ?? byAlias.get(normalized.split('/').at(-1))
    if (!matched) return { ...trial, displayName: trial.datasetTrial ?? trial.name }
    return {
      ...trial,
      displayName: taskDisplayName(matched.task) || trial.datasetTrial || trial.name,
      taskId: matched.task.id,
      datasetOrder: matched.datasetOrder,
    }
  })
}

export async function readTrialsPage(config, args) {
  const job = safeSegment(args.job, 'job')
  const offset = Math.max(0, Number.parseInt(args.offset ?? 0, 10) || 0)
  const limit = Math.min(MAX_TRIAL_LIMIT, Math.max(1, Number.parseInt(args.limit ?? 50, 10) || 50))
  const query = String(args.query ?? '').trim().toLowerCase()
  const status = String(args.status ?? '')
  const validity = String(args.validity ?? '')
  const evidence = String(args.evidence ?? '')
  const sort = String(args.sort ?? 'dataset-order')
  const source = await jobTrials(config, job)
  let trials = await enrichTrialsWithDataset(config, job, source.trials)
  if (query) trials = trials.filter(trial => `${trial.id ?? ''} ${trial.displayName ?? ''} ${trial.name ?? ''} ${trial.datasetTrial ?? ''}`.toLowerCase().includes(query))
  if (status) trials = trials.filter(trial => trial.status === status)
  if (validity) trials = trials.filter(trial => String(Boolean(trial.score?.valid)) === validity)
  if (evidence) trials = trials.filter(trial => String(Boolean(trial.evidenceAvailable)) === evidence)
  if (sort === 'dataset-order') trials = [...trials].sort((a, b) => a.datasetOrder - b.datasetOrder || a.attempt - b.attempt)
  if (sort === 'latest-completed') trials = [...trials].sort((a, b) => Date.parse(b.updatedAt ?? 0) - Date.parse(a.updatedAt ?? 0))
  if (sort === 'lowest-score') trials = [...trials].sort((a, b) => (a.score?.value ?? Number.POSITIVE_INFINITY) - (b.score?.value ?? Number.POSITIVE_INFINITY))
  if (sort === 'errors') trials = [...trials].sort((a, b) => Number(!b.exception && b.score?.valid !== false) - Number(!a.exception && a.score?.valid !== false))
  const items = trials.slice(offset, offset + limit)
  return {
    schemaVersion: 2, job, offset, limit, total: trials.length, datasetTotal: source.total,
    sort, items, hasMore: offset + items.length < trials.length, updatedAt: source.lifecycle?.updated_at,
  }
}

function assessmentName(id) {
  return `${String(id).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '') || 'trial'}.json`
}

function previewFromOutput(output, evidence = []) {
  if (typeof output === 'string' && output.trim()) return { kind: 'document', format: 'text', title: 'Agent output', content: output, provenance: evidence }
  if (!isObject(output)) return undefined
  if (typeof output.kind === 'string' && 'content' in output) return { ...output, provenance: evidence }
  const url = output.page_url ?? output.preview_url ?? output.url
  if (typeof url === 'string' && /^(https?:\/\/|\/)/.test(url)) return { kind: 'page', format: 'url', title: output.title ?? 'Generated page', url, content: output, provenance: evidence }
  if (typeof output.html === 'string') return { kind: 'page', format: 'html', title: output.title ?? 'Generated page', content: output.html, provenance: evidence }
  if (['answer', 'content', 'report', 'markdown', 'text'].some(key => typeof output[key] === 'string')) return { kind: 'document', format: 'json', title: output.title ?? 'Generated document', content: output, provenance: evidence }
  if ('metadata' in output && !['answer', 'content', 'report', 'markdown', 'text'].some(key => key in output)) return undefined
  return { kind: 'structured', format: 'json', title: output.title ?? 'Structured output', content: output, provenance: evidence }
}

async function previewFromTrialFiles(directory, lifecycle) {
  let trialName
  try { trialName = safeSegment(lifecycle?.name, 'trial directory') } catch { return undefined }
  const trialDirectory = path.join(directory, trialName)
  const check = await directoryCheck(trialDirectory)
  if (check.status !== 'ok') return undefined
  const manifest = await readJson(path.join(trialDirectory, 'artifacts', 'manifest.json'), { maxBytes: MAX_PREVIEW_BYTES, maxText: 128_000 })
  const candidates = []
  for (const entry of Array.isArray(manifest) ? manifest : []) {
    if (!isObject(entry) || !['ok', 'collected', 'mounted'].includes(entry.status) || typeof entry.destination !== 'string' || !entry.destination.startsWith('artifacts/')) continue
    const candidate = path.resolve(trialDirectory, entry.destination)
    const artifactRoot = path.resolve(trialDirectory, 'artifacts')
    if (candidate.startsWith(`${artifactRoot}${path.sep}`)) candidates.push(candidate)
  }
  const priority = new Map([['.html', 0], ['.htm', 0], ['.md', 1], ['.markdown', 1], ['.txt', 2], ['.json', 3]])
  candidates.sort((a, b) => (priority.get(path.extname(a).toLowerCase()) ?? 99) - (priority.get(path.extname(b).toLowerCase()) ?? 99) || a.localeCompare(b))
  for (const candidate of candidates) {
    try {
      const details = await lstat(candidate)
      if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_PREVIEW_BYTES) continue
      const format = path.extname(candidate).toLowerCase()
      const text = (await readFile(candidate, 'utf8')).replace(SENSITIVE_SOURCE_VALUE, '$1=[REDACTED]')
      const content = format === '.json' ? redact(JSON.parse(text), 0, 128_000) : redact(text, 0, 128_000)
      const kind = ['.html', '.htm'].includes(format)
        ? 'page'
        : format === '.json' && !(isObject(content) && ['answer', 'content', 'report', 'markdown', 'text'].some(key => typeof content[key] === 'string'))
          ? 'structured'
          : 'document'
      return { kind, format: format.replace('.', '') || 'text', title: path.basename(candidate), content, artifact_ref: path.relative(trialDirectory, candidate), provenance: [{ label: 'Agent Artifact', kind: 'agent-artifact', artifact_ref: path.relative(trialDirectory, candidate) }] }
    } catch { /* try the next declared artifact */ }
  }
  const trajectory = await readJson(path.join(trialDirectory, 'agent', 'trajectory.json'), { maxBytes: 2 * 1024 * 1024, maxText: 128_000 })
  const messages = (trajectory?.steps ?? []).filter(step => step?.source === 'agent' && typeof step.message === 'string').map(step => step.message)
  return messages.length ? { kind: 'document', format: 'text', title: 'Agent final response', content: messages.at(-1), artifact_ref: 'agent/trajectory.json', provenance: [{ label: 'ACP Final Response', kind: 'acp-final-response', artifact_ref: 'agent/trajectory.json' }] } : undefined
}

async function evaluatorResultFromTrialFiles(directory, lifecycle) {
  let trialName
  try { trialName = safeSegment(lifecycle?.name, 'trial directory') } catch { return undefined }
  const trialDirectory = path.join(directory, trialName)
  const check = await directoryCheck(trialDirectory)
  if (check.status !== 'ok') return undefined
  const result = await readJson(path.join(trialDirectory, 'verifier', 'evaluation-result.json'), { maxBytes: 128_000, maxText: 32_000 })
  return result && !result.__readError ? result : undefined
}

function enrichAssessmentWithEvaluator(assessment, evaluatorResult) {
  if (!assessment) return assessment
  const byCriterion = new Map((evaluatorResult?.criteria ?? []).filter(isObject).map(item => [String(item.id), item]))
  const criteria = (assessment.criteria ?? []).map(item => {
    const evaluator = byCriterion.get(String(item.id))
    return evaluator ? { ...item, reason: evaluator.reason ?? item.reason, recommendation: evaluator.recommendation ?? item.recommendation } : item
  })
  const evaluatorRecommendations = (evaluatorResult?.recommendations ?? []).map(item => isObject(item) ? item : { message: String(item) })
  return { ...assessment, criteria, recommendations: [...(assessment.recommendations ?? []), ...evaluatorRecommendations] }
}

async function datasetRoots(directory, projectRoot) {
  const entries = await readdir(directory, { withFileTypes: true })
  const roots = []
  for (const entry of entries.filter(item => item.isDirectory() && !item.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name))) {
    const result = await readJson(path.join(directory, entry.name, 'result.json'))
    const candidate = result?.task_id?.path
    if (typeof candidate !== 'string') continue
    try {
      const resolved = resolveWithin(projectRoot, path.relative(projectRoot, candidate), 'task path')
      const check = await directoryCheck(resolved)
      if (check.status === 'ok') roots.push(resolved)
    } catch { /* ignore historical out-of-root task sources */ }
  }
  return [...new Set(roots)]
}

export async function readDatasetPreview(config, args) {
  const job = safeSegment(args.job, 'job')
  const directory = jobDirectory(config, job)
  const snapshot = await readJson(path.join(directory, 'dataset-preview.json'), { maxBytes: MAX_JSON_BYTES, maxText: 128_000 })
  if (snapshot && !snapshot.__readError) return { ...snapshot, source: 'job-snapshot' }
  const manifest = await readJson(path.join(directory, 'dataset-manifest.json'))
  if (!manifest || manifest.__readError) throw new Error('Dataset Manifest is unavailable')
  const roots = await datasetRoots(directory, config.projectRoot)
  const tasks = []
  for (const [index, task] of (manifest.tasks ?? []).entries()) {
    const root = roots[Math.min(index, Math.max(0, roots.length - 1))]
    let instruction = { error: 'instruction source is unavailable for this historical Job' }
    if (root && typeof task?.instruction === 'string') {
      try { instruction = await readSafeText(resolveWithin(root, task.instruction, 'task.instruction'), config.projectRoot) } catch { instruction = { error: 'instruction path is invalid' } }
    }
    tasks.push({ id: task?.id ?? `task-${index + 1}`, path: task?.path ?? '.', instruction_file: task?.instruction, instruction: instruction.text, instruction_error: instruction.error, instruction_truncated: Boolean(instruction.text?.includes('[TRUNCATED')) })
  }
  return { schema_version: 1, dataset_id: manifest.dataset_id, version: manifest.version, source_digest: manifest.source_digest, task_count: tasks.length, tasks, source: 'historical-source-fallback' }
}

export async function readTrialDetail(config, args) {
  const job = safeSegment(args.job, 'job')
  const trial = safeSegment(args.trial, 'trial')
  const directory = jobDirectory(config, job)
  let assessment = await readJson(path.join(directory, 'trial-assessments', assessmentName(trial)))
  const source = await jobTrials(config, job)
  const lifecycle = source.trials.find(item => String(item.id) === trial || String(item.datasetTrial) === trial || String(item.name) === trial)
  if ((!assessment || assessment.__readError) && lifecycle?.id && String(lifecycle.id) !== trial) {
    assessment = await readJson(path.join(directory, 'trial-assessments', assessmentName(lifecycle.id)))
  }
  if (assessment?.__readError) throw new Error('Trial assessment is invalid')
  if (!assessment && !lifecycle) throw new Error('Trial not found')
  assessment = enrichAssessmentWithEvaluator(assessment, await evaluatorResultFromTrialFiles(directory, lifecycle))
  const assessmentPreview = previewFromOutput(assessment?.output, assessment?.evidence_provenance)
  const realAssessmentOutput = assessment?.evidence_provenance?.some(item => item?.kind === 'real-renderer' || item?.kind === 'agent-artifact')
  const filePreview = realAssessmentOutput ? undefined : await previewFromTrialFiles(directory, lifecycle)
  const preview = realAssessmentOutput ? assessmentPreview : filePreview ?? assessmentPreview
  return {
    schemaVersion: 2, job, trial, lifecycle,
    status: lifecycle?.status ?? assessment?.status,
    assessment,
    preview,
    capability: assessment ? 'assessment-available' : 'running-evidence-not-yet-available',
  }
}

export async function readJobProgress(config, args) {
  const job = safeSegment(args.job, 'job')
  const since = args.since ? Date.parse(args.since) : 0
  const source = await jobTrials(config, job)
  const changed = source.trials.filter(item => !since || Date.parse(item.updatedAt ?? 0) > since)
  return {
    schemaVersion: 1,
    job,
    updatedAt: source.lifecycle?.updated_at ?? new Date().toISOString(),
    datasetTotal: source.total,
    counts: source.lifecycle?.counts ?? {},
    changed,
  }
}

export async function readMetaEvaluation(config, args = {}) {
  const evaluationRoot = resolveWithin(config.projectRoot, args.evaluationRoot ?? '.', 'evaluationRoot')
  const index = await readJson(path.join(evaluationRoot, '.harbor', 'meta-artifacts.json'))
  const registered = index?.schema_version === 1 ? index.artifacts ?? {} : {}
  const groundTruthPath = resolveWithin(evaluationRoot, registered.ground_truth ?? '.harbor/ground-truth.json', 'groundTruthPath')
  const reportPath = resolveWithin(evaluationRoot, registered.meta_evaluation_report ?? '.harbor/meta-evaluation-report.json', 'metaEvaluationReportPath')
  const groundTruth = await readJson(groundTruthPath, { maxText: 64_000 })
  const report = await readJson(reportPath, { maxText: 64_000 })
  const availableGroundTruth = groundTruth && !groundTruth.__readError
  const availableReport = report && !report.__readError
  const cases = availableGroundTruth && Array.isArray(groundTruth.cases) ? groundTruth.cases : []
  const disagreementOffset = Math.max(0, Number.parseInt(args.offset ?? 0, 10) || 0)
  const disagreementLimit = Math.min(100, Math.max(1, Number.parseInt(args.limit ?? 20, 10) || 20))
  const disagreements = availableReport && Array.isArray(report.disagreements) ? report.disagreements : []
  const pagedReport = availableReport ? {
    ...report,
    disagreements: disagreements.slice(disagreementOffset, disagreementOffset + disagreementLimit),
  } : undefined
  return {
    schemaVersion: 1,
    evaluationRoot: path.relative(config.projectRoot, evaluationRoot) || '.',
    status: availableReport ? 'evaluated' : availableGroundTruth ? (cases.length ? 'ground-truth-ready' : 'ground-truth-draft') : 'ground-truth-required',
    groundTruth: availableGroundTruth ? {
      id: groundTruth.ground_truth_id,
      version: groundTruth.version,
      source: groundTruth.source,
      criteria: groundTruth.criteria ?? [],
      caseCount: cases.length,
      badcaseCount: cases.filter(item => item?.badcase).length,
      path: path.relative(config.projectRoot, groundTruthPath),
    } : undefined,
    report: pagedReport,
    artifactIndex: index?.schema_version === 1 ? path.relative(config.projectRoot, path.join(evaluationRoot, '.harbor', 'meta-artifacts.json')) : undefined,
    disagreementPagination: {
      offset: disagreementOffset,
      limit: disagreementLimit,
      total: disagreements.length,
      hasMore: disagreementOffset + disagreementLimit < disagreements.length,
    },
    workflow: {
      candidate: 'Evaluator / Rubric / Judge identity',
      dataset: 'Fixed artifacts plus independent Ground Truth',
      output: 'Repeated evaluator-observations/v1',
      verifier: 'ESF / SCE / RCR reducer',
      automaticAgentBaseline: false,
      sourceKinds: ['human', 'programmatic', 'consensus', 'model', 'external'],
      nextAction: !availableGroundTruth
        ? 'Initialize Ground Truth with harbor_ground_truth_init, then add versioned cases.'
        : !cases.length
          ? 'Add cases with artifact_ref and ternary criterion labels before collecting observations.'
          : !availableReport
            ? 'Collect repeated evaluator observations and run harbor_evaluator_meta_evaluate.'
            : 'Review disagreements before adopting the evaluator and establishing a fresh Agent baseline.',
    },
  }
}

function compareTrialMaps(summary) {
  return new Map((summary?.trials ?? []).map(item => [String(item.datasetTrial ?? item.name ?? item.id), normalizeTrial(item, 0)]))
}

export async function readComparison(config, args) {
  const baselineJob = safeSegment(args.baseline, 'baseline')
  const candidateJob = safeSegment(args.candidate, 'candidate')
  const [baseline, candidate, baselineContract, candidateContract] = await Promise.all([
    readJson(path.join(jobDirectory(config, baselineJob), SUMMARY_NAME)),
    readJson(path.join(jobDirectory(config, candidateJob), SUMMARY_NAME)),
    readJson(path.join(jobDirectory(config, baselineJob), 'evaluation-contract.json')),
    readJson(path.join(jobDirectory(config, candidateJob), 'evaluation-contract.json')),
  ])
  if (!baseline || baseline.__readError || !candidate || candidate.__readError) throw new Error('Both Job summaries are required')
  const baselineContext = baseline.evaluation_context ?? await readJson(path.join(jobDirectory(config, baselineJob), 'evaluation-context.json'))
  const candidateContext = candidate.evaluation_context ?? await readJson(path.join(jobDirectory(config, candidateJob), 'evaluation-context.json'))
  const baselineKind = normalizedJobKind(baseline, baselineContext)
  const candidateKind = normalizedJobKind(candidate, candidateContext)
  if (baselineKind !== CANDIDATE_JOB_KIND || candidateKind !== CANDIDATE_JOB_KIND) {
    const error = {
      code: 'UNSUPPORTED_JOB_KIND_FOR_PROMOTION',
      message: 'Historical Generation Evaluation Jobs are diagnostic evidence and cannot be used as a Candidate baseline, comparison, or Promotion Gate input.',
    }
    return {
      schemaVersion: 1,
      baselineJob,
      candidateJob,
      baselineJobKind: baselineKind,
      candidateJobKind: candidateKind,
      comparable: false,
      comparabilityReasons: [error],
      metrics: {},
      population: {},
      improvedTrials: [],
      regressedTrials: [],
      newExceptions: [],
      artifactRegressions: [],
      gateEligibility: 'not-applicable',
      error,
      note: 'Convert reviewed badcases into a fixed regression Dataset before running Candidate comparison or Gate.',
    }
  }
  const reasons = []
  if (baselineContext?.schema_version !== 2 || candidateContext?.schema_version !== 2) reasons.push('Context v2 is required')
  if (!baselineContext?.digest || baselineContext.digest !== candidateContext?.digest) reasons.push('Evaluation Context differs; establish a fresh baseline')
  if (baselineContract?.contract_id !== candidateContract?.contract_id || baselineContract?.version !== candidateContract?.version) reasons.push('Evaluation Contract identity differs')
  const directions = Object.fromEntries((candidateContract?.metrics ?? []).map(item => [item.id, item.direction ?? 'maximize']))
  const metrics = Object.fromEntries([...new Set([...Object.keys(baseline.metrics ?? {}), ...Object.keys(candidate.metrics ?? {})])].map(key => [key, {
    baseline: baseline.metrics?.[key], candidate: candidate.metrics?.[key],
    delta: typeof baseline.metrics?.[key] === 'number' && typeof candidate.metrics?.[key] === 'number' ? candidate.metrics[key] - baseline.metrics[key] : undefined,
    direction: directions[key] ?? 'maximize',
    improvement: typeof baseline.metrics?.[key] === 'number' && typeof candidate.metrics?.[key] === 'number'
      ? (directions[key] === 'minimize' ? baseline.metrics[key] - candidate.metrics[key] : candidate.metrics[key] - baseline.metrics[key])
      : undefined,
  }]))
  const oldTrials = compareTrialMaps(baseline)
  const nextTrials = compareTrialMaps(candidate)
  const improved = []
  const regressed = []
  const primaryDirection = directions[candidateContract?.primary_metric] ?? 'maximize'
  for (const trial of [...oldTrials.keys()].filter(key => nextTrials.has(key)).sort()) {
    const oldValue = oldTrials.get(trial).score?.value ?? oldTrials.get(trial).rewards?.reward
    const newValue = nextTrials.get(trial).score?.value ?? nextTrials.get(trial).rewards?.reward
    if (typeof oldValue !== 'number' || typeof newValue !== 'number' || oldValue === newValue) continue
    const item = { trial, baseline: oldValue, candidate: newValue, delta: newValue - oldValue }
    const isImproved = primaryDirection === 'minimize' ? newValue < oldValue : newValue > oldValue
    ;(isImproved ? improved : regressed).push(item)
  }
  const baselineExceptions = new Set((baseline.exceptions ?? []).map(item => String(item.trial)))
  const newExceptions = (candidate.exceptions ?? []).filter(item => !baselineExceptions.has(String(item.trial)))
  const artifactRegressions = (baseline.artifact_validation?.valid && !candidate.artifact_validation?.valid) ? ['artifact-validation'] : []
  return {
    schemaVersion: 1, baselineJob, candidateJob, comparable: reasons.length === 0, comparabilityReasons: reasons,
    metrics, population: { baseline: baseline.n_trials, candidate: candidate.n_trials, baselineValid: baseline.n_valid_scores, candidateValid: candidate.n_valid_scores },
    improvedTrials: improved, regressedTrials: regressed, newExceptions, artifactRegressions,
    gateEligibility: reasons.length ? 'not-comparable' : 'requires-explicit-gate',
    note: 'This read-only comparison never runs Gate, promotes a Candidate, deploys, or publishes.',
  }
}

export async function readEvaluatorGovernance(config, args) {
  const job = safeSegment(args.job, 'job')
  const directory = jobDirectory(config, job)
  const [stack, sources, contract, context] = await Promise.all([
    readJson(path.join(directory, 'evaluation-stack-manifest.json')),
    readJson(path.join(directory, 'evaluation-stack-sources.json'), { maxText: MAX_SOURCE_BYTES }),
    readJson(path.join(directory, 'evaluation-contract.json')),
    readJson(path.join(directory, 'evaluation-context.json')),
  ])
  if (!stack || stack.__readError) throw new Error('Evaluation Stack is unavailable')
  const historicalSources = sources?.schema_version === 1 && sources.stack_digest === stack.digest
    ? sources
    : undefined
  const components = {}
  for (const [role, component] of Object.entries(stack.components ?? {})) {
    const entry = component?.entry
    const snapshot = historicalSources?.components?.[role]
    const snapshotFile = snapshot?.files?.find(item => item.path === entry && item.text)
      ?? snapshot?.files?.find(item => item.text)
    const source = snapshotFile
      ? { ...snapshotFile, source: 'job-snapshot', readOnly: true }
      : entry
        ? { ...(await readSafeText(resolveWithin(config.projectRoot, entry, `${role}.entry`), config.projectRoot)), source: 'historical-live-fallback', readOnly: true }
        : { error: 'entry unavailable', source: 'unavailable', readOnly: true }
    components[role] = { ...component, source }
  }
  let comparison
  if (args.compareJob) {
    const other = await readJson(path.join(jobDirectory(config, safeSegment(args.compareJob, 'compareJob')), 'evaluation-stack-manifest.json'))
    const changes = []
    for (const role of new Set([...Object.keys(stack.components ?? {}), ...Object.keys(other?.components ?? {})])) {
      const before = other?.components?.[role]
      const after = stack.components?.[role]
      if (before?.digest !== after?.digest || before?.version !== after?.version) changes.push({ role, before, after, rewardAffecting: Boolean(before?.reward_affecting || after?.reward_affecting) })
    }
    comparison = {
      changes,
      freshBaselineRequired: changes.some(item => item.rewardAffecting) || JSON.stringify(other?.judge) !== JSON.stringify(stack.judge),
      createsNewIdentity: true,
      overwritesHistoricalIdentity: false,
    }
  }
  return {
    schemaVersion: 1, job, stackIdentity: { id: stack.stack_id, version: stack.version, digest: stack.digest, comparisonDigest: stack.comparison_digest },
    judge: stack.judge, contract, contextDigest: context?.digest, components, comparison,
    editingPolicy: {
      browserWriteEnabled: false,
      saveBehavior: 'Create a new Stack/component identity in source control, then run a fresh baseline when reward-affecting semantics change.',
      automaticEvaluation: false, automaticGate: false,
    },
    upgradeWorkflow: {
      steps: [
        'Inspect the current Evaluator, Rubric, Judge, Contract, and representative false-positive/false-negative Trials.',
        'Create a new Evaluator/Rubric/Judge identity and source file; never overwrite the historical identity.',
        'Run meta-evaluation against independently maintained, provenance-bearing GT and report ESF, SCE, RCR, latency, and cost as applicable.',
        'Update Evaluation Stack identity and preview Context v2 impact.',
        'Establish a fresh Agent baseline before comparing Agent Candidates under the new reward semantics.',
      ],
      freshBaselineRequiredWhen: ['evaluator digest changes', 'rubric digest changes', 'judge identity or parameters change'],
      automaticActions: [],
      skillPrompt: 'Use evolve-agent-with-harbor to upgrade this evaluator. First inspect governance evidence, clarify GT source type, provenance, ownership, and target meta-metrics, then propose a new immutable evaluator identity and fresh-baseline plan. Do not edit or run anything until I approve the controlled change.',
    },
  }
}
