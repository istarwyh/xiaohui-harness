import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { MANIFEST_NAME, snapshotCandidate } from './candidate.js'
import { runProcess } from './process.js'

export function resolveWithin(root, value, label) {
  const base = path.resolve(root)
  const resolved = path.resolve(base, value)
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(
      `PATH_OUTSIDE_PROJECT_ROOT: ${label} must stay under projectRoot.\n` +
      `projectRoot: ${base}\n` +
      `${label}: ${value}\n` +
      'Recommended fix: use a path inside the current Agent session directory, or open the intended project as the session working directory. The Web Workbench projectRoot can be switched and reloaded in Harbor settings.',
    )
  }
  return resolved
}

const META_ARTIFACT_INDEX = '.harbor/meta-artifacts.json'

function inferEvaluationRoot(projectRoot, artifactPath, explicitRoot) {
  if (explicitRoot) return resolveWithin(projectRoot, explicitRoot, 'evaluationRoot')
  const relative = path.relative(projectRoot, artifactPath)
  const parts = relative.split(path.sep)
  const marker = parts.lastIndexOf('.harbor')
  return marker >= 0 ? path.resolve(projectRoot, ...parts.slice(0, marker)) : path.resolve(projectRoot)
}

async function recordMetaArtifact(config, artifactPath, key, explicitRoot) {
  const evaluationRoot = inferEvaluationRoot(config.projectRoot, artifactPath, explicitRoot)
  const registeredArtifact = resolveWithin(evaluationRoot, artifactPath, key)
  const indexPath = resolveWithin(evaluationRoot, META_ARTIFACT_INDEX, 'metaArtifactIndex')
  let current = { schema_version: 1, artifacts: {} }
  try {
    const parsed = JSON.parse(await readFile(indexPath, 'utf8'))
    if (parsed?.schema_version === 1 && parsed.artifacts && typeof parsed.artifacts === 'object') current = parsed
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
  }
  current.artifacts[key] = path.relative(evaluationRoot, registeredArtifact).split(path.sep).join('/')
  await mkdir(path.dirname(indexPath), { recursive: true })
  const temporary = `${indexPath}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  await rename(temporary, indexPath)
  return path.relative(config.projectRoot, indexPath).split(path.sep).join('/')
}

export async function snapshot(config, args) {
  const candidateDir = resolveWithin(config.projectRoot, args.candidatePath, 'candidatePath')
  return snapshotCandidate(candidateDir, {
    candidateId: args.candidateId,
    version: args.version,
  })
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'candidate'
}

export function makeJobName(manifest, now = new Date()) {
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')
  const suffix = `${timestamp}-${manifest.digest.slice(7, 15)}`
  const identity = `${slug(manifest.candidate_id)}-${slug(manifest.version)}`.slice(0, 99 - suffix.length)
  return `${identity}-${suffix}`
}

export function makeHistoricalJobName(batch, now = new Date()) {
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')
  const digest = String(batch?.digest ?? '').replace(/^sha256:/, '').slice(0, 8) || 'historical'
  return `dsh-session-history-${timestamp}-${digest}`
}

const HISTORICAL_COVERAGE_KEYS = [
  'scored_trials',
  'unscored_trials',
  'total_trials',
  'trial_rate',
  'criterion_scored',
  'criterion_total',
  'criterion_rate',
]

function historicalCoverageMatches(summaryCoverage, completionCoverage) {
  if (!summaryCoverage || !completionCoverage) return false
  return HISTORICAL_COVERAGE_KEYS.every(key => (
    typeof summaryCoverage[key] === 'number'
    && summaryCoverage[key] === completionCoverage[key]
  ))
}

/**
 * Harbor 0.21 treats Job-plugin finalization failures as warnings, so a zero
 * process exit is not proof that Historical artifacts completed. Validate the
 * fresh plugin-owned sentinel and its core Summary cross-links fail-closed.
 */
export function assertHistoricalCompletion(summary, completion, {
  jobName,
  batchDigest,
  batchId,
  recordCount,
}) {
  const summaryValid = (
    summary?.schema_version === 4
    && summary?.job === jobName
    && summary?.job_kind === 'historical-generation-evaluation'
    && summary?.mode === 'diagnostic'
    && summary?.execution_mode === 'observe-existing'
    && summary?.evaluation_target?.digest === batchDigest
    && summary?.evaluation_target?.batch_id === batchId
    && summary?.evaluation_target?.record_count === recordCount
    && summary?.n_trials === recordCount
    && summary?.coverage?.total_trials === recordCount
    && summary?.artifact_validation?.valid === true
    && summary?.candidate === undefined
  )
  if (!summaryValid) {
    throw new Error('HISTORICAL_JOB_IDENTITY_INVALID: the Summary is not a validated, Candidate-free Historical Generation Evaluation for this Batch')
  }
  const completionValid = (
    completion?.schema_version === 1
    && completion?.job_kind === 'historical-generation-evaluation'
    && completion?.status === 'completed'
    && completion?.valid === true
    && completion?.job === jobName
    && completion?.summary_path === 'evaluation-summary.json'
    && completion?.artifact_registry_path === 'artifact-registry.json'
    && historicalCoverageMatches(summary.coverage, completion.coverage)
  )
  if (!completionValid) {
    throw new Error('HISTORICAL_JOB_ARTIFACT_VALIDATION_FAILED: the completion sentinel is missing, stale, or inconsistent with the validated Summary')
  }
}

async function cliJson(config, args, { allowedExitCodes = [0], input } = {}) {
  let result
  try {
    result = await runProcess(config.harborDshBin, args, {
      cwd: config.projectRoot,
      timeoutMs: config.timeoutMs,
      allowedExitCodes,
      input,
      env: { ...process.env, ...(config.pythonPath ? { PYTHONPATH: config.pythonPath } : {}) },
    })
  } catch (error) {
    const detail = error?.result?.stderr?.trim().split('\n').at(-1)?.replace(/^[A-Za-z]+Error:\s*/, '')
    throw new Error(detail || error.message)
  }
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`harbor-dsh returned invalid JSON for ${args.slice(0, 2).join(' ')}`)
  }
}

export async function inspectEvaluator(config, args = {}) {
  const stack = resolveWithin(config.projectRoot, args.stackPath ?? '.harbor/evaluation-stack.yml', 'stackPath')
  return cliJson(config, [
    'evaluator', 'inspect',
    '--project-root', config.projectRoot,
    '--stack', stack,
  ])
}

export async function updateEvaluator(config, args) {
  const stack = resolveWithin(config.projectRoot, args.stackPath ?? '.harbor/evaluation-stack.yml', 'stackPath')
  if (typeof args.content !== 'string') throw new Error('content is required')
  return cliJson(config, [
    'evaluator', 'update',
    '--project-root', config.projectRoot,
    '--stack', stack,
    '--file', String(args.filePath ?? ''),
    '--expected-digest', String(args.expectedDigest ?? ''),
    '--new-evaluator-version', String(args.newEvaluatorVersion ?? ''),
    '--new-stack-version', String(args.newStackVersion ?? ''),
    '--content-stdin',
  ], { input: args.content })
}

export async function initializeGroundTruth(config, args) {
  const output = resolveWithin(config.projectRoot, args.outputPath ?? '.harbor/ground-truth.json', 'outputPath')
  const result = await cliJson(config, [
    'ground-truth', 'init',
    '--project-root', config.projectRoot,
    '--output', output,
    '--id', String(args.groundTruthId ?? ''),
    '--version', String(args.version ?? ''),
    '--source-kind', String(args.sourceKind ?? ''),
    '--source-description', String(args.sourceDescription ?? ''),
    '--provenance', String(args.provenance ?? ''),
    '--criteria', String(args.criteria ?? ''),
  ])
  result.artifact_index = await recordMetaArtifact(config, output, 'ground_truth', args.evaluationRoot)
  return result
}

export async function runMetaEvaluation(config, args) {
  const groundTruth = resolveWithin(config.projectRoot, args.groundTruthPath ?? '.harbor/ground-truth.json', 'groundTruthPath')
  const observations = resolveWithin(config.projectRoot, args.observationsPath, 'observationsPath')
  const output = resolveWithin(config.projectRoot, args.outputPath ?? '.harbor/meta-evaluation-report.json', 'outputPath')
  const result = await cliJson(config, [
    'meta-evaluate',
    '--project-root', config.projectRoot,
    '--ground-truth', groundTruth,
    '--observations', observations,
    '--output', output,
  ])
  const evaluationRoot = args.evaluationRoot
    ?? inferEvaluationRoot(config.projectRoot, groundTruth)
  result.artifact_index = await recordMetaArtifact(config, output, 'meta_evaluation_report', evaluationRoot)
  return result
}

function strictInputs(config, args) {
  const projectRoot = path.resolve(config.projectRoot)
  const candidate = resolveWithin(projectRoot, args.candidatePath, 'candidatePath')
  const dataset = resolveWithin(projectRoot, args.datasetPath, 'datasetPath')
  const stack = resolveWithin(projectRoot, args.stackPath, 'stackPath')
  const jobs = resolveWithin(projectRoot, config.jobsDir, 'jobsDir')
  const mode = args.mode
  if (!['diagnostic', 'promotion-eligible'].includes(mode)) throw new Error('mode must be diagnostic or promotion-eligible')
  const policy = args.policyPath ? resolveWithin(projectRoot, args.policyPath, 'policyPath') : undefined
  if (mode === 'promotion-eligible' && !policy) throw new Error('promotion-eligible mode requires policyPath')
  return { projectRoot, candidate, dataset, stack, jobs, mode, policy }
}

function candidateModelCliArgs(binding) {
  if (!binding?.provider || !binding?.model) throw new Error('Candidate model binding is required')
  return [
    '--candidate-model-provider', binding.provider,
    '--candidate-model', binding.model,
    ...(binding.reasoning_effort === undefined
      ? []
      : ['--candidate-reasoning-effort', binding.reasoning_effort]),
    '--candidate-model-transport', binding.transport,
    '--candidate-model-protocol', binding.protocol,
  ]
}

export function redactDiagnostic(value) {
  return String(value ?? '')
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,'"}]+/gi, '$1[redacted]')
    .replace(/(bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[redacted]')
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,'"}]+/gi, '$1[redacted]')
}

export function classifyHarborFailure(value) {
  const text = String(value ?? '')
  const suggestions = []
  if (/AgentSetupTimeoutError|agent setup.{0,30}time(?:d out|out)/i.test(text)) {
    suggestions.push({ code: 'AGENT_SETUP_TIMEOUT', action: 'Use a base image with Python, curl, Node.js, npm, and ACP/DSH dependencies already installed; then rerun Doctor.' })
  }
  if (/evaluation-result\.json is missing/i.test(text)) {
    suggestions.push({ code: 'EVALUATOR_RESULT_MISSING', action: 'Update tests/test.sh or its evaluator script to write /logs/verifier/evaluation-result.json using evaluation-result/v1.' })
  }
  if (/Either datasets or tasks must be provided|HARBOR_RUNTIME_NO_TASKS/i.test(text)) {
    suggestions.push({ code: 'DATASET_NOT_RESOLVED', action: 'Make the Dataset root contain immediate Task subdirectories with schema_version = "1.4", [task] name = "org/name", instruction.md, environment/, and tests/test.sh.' })
  }
  if (/docker-credential-|credential helper/i.test(text)) {
    suggestions.push({ code: 'DOCKER_CREDENTIAL_HELPER', action: 'Repair the configured Docker credential helper or use a verified image already present in the local Docker daemon.' })
  }
  if (/Cannot connect to the Docker daemon|DOCKER_DAEMON_UNAVAILABLE/i.test(text)) {
    suggestions.push({ code: 'DOCKER_DAEMON_UNAVAILABLE', action: 'Start Docker and confirm `docker version` can reach the server.' })
  }
  if (!suggestions.length) {
    suggestions.push({ code: 'INSPECT_JOB_LOG', action: 'Review the stderr/job.log excerpt below, fix the first causal error, rerun Doctor, then retry the Job.' })
  }
  return suggestions
}

async function optionalTail(pathname, maxChars = 6000) {
  try {
    const value = await readFile(pathname, 'utf8')
    return value.slice(-maxChars)
  } catch {
    return ''
  }
}

export async function explainHarborFailure(error, jobDir) {
  const stderr = error?.result?.stderr ?? ''
  const stdout = error?.result?.stdout ?? ''
  const logCandidates = ['job.log', 'harbor.log']
  const logParts = (await Promise.all(logCandidates.map(name => optionalTail(path.join(jobDir, name)))))
    .filter(Boolean)
  const detail = redactDiagnostic([stderr.slice(-8000), ...logParts, stdout.slice(-2000)].filter(Boolean).join('\n'))
  const suggestions = classifyHarborFailure(detail || error?.message)
  const lines = [
    `HARBOR_JOB_FAILED: Harbor exited with code ${error?.result?.code ?? 'unknown'}.`,
    `jobPath: ${jobDir}`,
    ...suggestions.map(item => `nextStep[${item.code}]: ${item.action}`),
  ]
  if (detail.trim()) lines.push('diagnosticTail:', detail.trim())
  return new Error(lines.join('\n'))
}

export async function validateDataset(config, args) {
  const dataset = resolveWithin(config.projectRoot, args.datasetPath, 'datasetPath')
  return cliJson(config, ['dataset', 'validate', dataset, '--project-root', config.projectRoot], { allowedExitCodes: [0, 2] })
}

export async function initializeProject(config, args) {
  const dataset = resolveWithin(config.projectRoot, args.datasetPath, 'datasetPath')
  return cliJson(config, [
    'init', '--project-root', config.projectRoot, '--dataset', dataset,
    '--stack-id', args.stackId, '--stack-version', args.stackVersion,
    '--dataset-id', args.datasetId, '--dataset-version', args.datasetVersion,
    '--contract-id', args.contractId, '--contract-version', args.contractVersion,
    '--primary-metric', args.primaryMetric, '--primary-direction', args.primaryDirection,
    '--judge-provider', args.judgeProvider, '--judge-model', args.judgeModel, '--judge-version', args.judgeVersion,
    '--policy-id', args.policyId, '--policy-version', args.policyVersion,
    '--min-improvement', String(args.minImprovement),
    '--workspace-subdir', String(args.workspaceSubdir ?? '.'),
  ])
}

export async function initializeQuickDiagnostic(config, args) {
  return cliJson(config, [
    'quick', 'diagnostic',
    '--project-root', config.projectRoot,
    '--query', String(args.query ?? ''),
    '--rubric', String(args.rubric ?? ''),
    '--workspace-subdir', String(args.workspaceSubdir ?? 'harbor-diagnostic'),
  ])
}

export async function runDoctor(config, args) {
  const inputs = strictInputs(config, { ...args, mode: args.mode ?? 'diagnostic' })
  const command = ['doctor', '--architecture', '--runtime', '--project-root', inputs.projectRoot, '--stack', inputs.stack, '--dataset', inputs.dataset]
  if (args.candidatePath) command.push('--candidate', inputs.candidate)
  if (inputs.policy) command.push('--policy', inputs.policy)
  return cliJson(config, command, { allowedExitCodes: [0, 2] })
}

export async function previewContext(config, args) {
  const manifest = await snapshot(config, args)
  const inputs = strictInputs(config, args)
  const preview = await cliJson(config, [
    'context', 'preview',
    '--project-root', inputs.projectRoot,
    '--candidate', inputs.candidate,
    '--dataset', inputs.dataset,
    '--stack', inputs.stack,
    '--jobs-dir', inputs.jobs,
    '--mode', inputs.mode,
    ...candidateModelCliArgs(args.candidateModelBinding),
  ])
  return { manifest, ...preview }
}

export async function runEvaluation(config, args, modelRuntime) {
  const manifest = await snapshot(config, args)
  const inputs = strictInputs(config, args)
  const datasetValidation = await validateDataset(config, args)
  if (!datasetValidation.valid) {
    throw new Error(
      `Dataset validation failed under projectRoot ${inputs.projectRoot}:\n` +
      datasetValidation.findings.map(item => `${item.code}: ${item.message}`).join('\n'),
    )
  }
  const doctor = await runDoctor(config, args)
  const runtimeBlockers = doctor.findings.filter(item => item.level === 'error' && item.code.startsWith('DOCKER_'))
  if (runtimeBlockers.length) {
    throw new Error(`Runtime Doctor blocked Harbor Job:\n${runtimeBlockers.map(item => `${item.code}: ${item.message}`).join('\n')}`)
  }
  if (inputs.mode === 'promotion-eligible' && !doctor.promotion_ready) {
    throw new Error(`Architecture Doctor blocked promotion-eligible Job: ${doctor.findings.filter(item => item.level === 'error').map(item => item.code).join(', ')}`)
  }
  const preview = await cliJson(config, [
    'context', 'preview', '--project-root', inputs.projectRoot,
    '--candidate', inputs.candidate, '--dataset', inputs.dataset,
    '--stack', inputs.stack, '--jobs-dir', inputs.jobs, '--mode', inputs.mode,
    ...candidateModelCliArgs(args.candidateModelBinding),
  ])
  const jobName = args.jobName ?? makeJobName(manifest)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(jobName)) throw new Error('jobName contains unsupported characters')

  const harborArgs = [
    'run', '-p', inputs.dataset,
    '-a', config.agentImportPath,
    '--ak', `candidate_path=${inputs.candidate}`,
    '--ak', `candidate_version=${manifest.version}`,
    '--ak', `candidate_digest=${manifest.digest}`,
    '--ak', `candidate_model_provider=${args.candidateModelBinding.provider}`,
    '--ak', `candidate_model=${args.candidateModelBinding.model}`,
    '--job-name', jobName,
    '--jobs-dir', inputs.jobs,
    '--plugin', config.pluginImportPath,
    '--plugin-kwarg', `candidate_manifest=${path.join(inputs.candidate, MANIFEST_NAME)}`,
    '--plugin-kwarg', `dataset_path=${inputs.dataset}`,
    '--plugin-kwarg', `stack_path=${inputs.stack}`,
    '--plugin-kwarg', `project_root=${inputs.projectRoot}`,
    '--plugin-kwarg', `mode=${inputs.mode}`,
    '--plugin-kwarg', `candidate_model_provider=${args.candidateModelBinding.provider}`,
    '--plugin-kwarg', `candidate_model=${args.candidateModelBinding.model}`,
    '--plugin-kwarg', `candidate_model_transport=${args.candidateModelBinding.transport}`,
    '--plugin-kwarg', `candidate_model_protocol=${args.candidateModelBinding.protocol}`,
  ]
  if (args.candidateModelBinding.reasoning_effort !== undefined) {
    harborArgs.push('--ak', `candidate_reasoning_effort=${args.candidateModelBinding.reasoning_effort}`)
    harborArgs.push('--plugin-kwarg', `candidate_reasoning_effort=${args.candidateModelBinding.reasoning_effort}`)
  }
  if (inputs.policy) harborArgs.push('--plugin-kwarg', `policy_path=${inputs.policy}`)
  const lease = await modelRuntime.openLease(args.candidateModelBinding, {
    candidateDigest: manifest.digest,
    jobName,
  })
  try {
    const jobDir = path.join(inputs.jobs, jobName)
    let processResult
    try {
      processResult = await runProcess(config.harborBin, harborArgs, {
        cwd: config.projectRoot,
        timeoutMs: config.timeoutMs,
        env: {
          ...process.env,
          ...(config.pythonPath ? { PYTHONPATH: config.pythonPath } : {}),
          HSE_MODEL_GATEWAY_URL: lease.endpoint,
          HSE_MODEL_GATEWAY_TOKEN: lease.token,
          HSE_MODEL_GATEWAY_PROVIDER: lease.candidateProvider,
          HSE_MODEL_GATEWAY_INFO: JSON.stringify(lease.modelInfo),
          HSE_MODEL_GATEWAY_PROTOCOL: lease.protocol,
        },
      })
    } catch (error) {
      throw await explainHarborFailure(error, jobDir)
    }
    const summary = JSON.parse(await readFile(path.join(jobDir, 'evaluation-summary.json'), 'utf8'))
    return {
      manifest,
      candidateModelBinding: args.candidateModelBinding,
      job: path.relative(inputs.projectRoot, jobDir),
      summary,
      doctor,
      contextPreview: preview,
      process: { code: processResult.code },
    }
  } finally {
    await lease.close()
  }
}

/**
 * Materialize an immutable Historical Generation Batch before Harbor creates
 * its Job, then run a deterministic Observation Adapter. This path never
 * snapshots or executes a Candidate.
 */
export async function runHistoricalEvaluation(config, args, modelRuntime) {
  const projectRoot = path.resolve(config.projectRoot)
  const batchPath = resolveWithin(projectRoot, args.batchPath, 'batchPath')
  const batchDir = resolveWithin(projectRoot, args.batchDir ?? path.dirname(batchPath), 'batchDir')
  const output = resolveWithin(projectRoot, path.join(batchDir, 'dataset'), 'historicalDataset')
  if (!args.judgeBinding?.provider || !args.judgeBinding?.model) {
    throw new Error('Historical Judge model binding is required before materialization')
  }
  const materialized = await cliJson(config, [
    'historical', 'materialize',
    '--project-root', projectRoot,
    '--batch', batchPath,
    '--output', output,
    '--judge-provider', args.judgeBinding.provider,
    '--judge-model', args.judgeBinding.model,
    ...(args.judgeBinding.reasoning_effort === undefined
      ? []
      : ['--judge-reasoning-effort', args.judgeBinding.reasoning_effort]),
  ])
  const dataset = resolveWithin(projectRoot, materialized.dataset_path ?? output, 'historicalDataset')
  const stack = resolveWithin(projectRoot, materialized.stack_path, 'historicalStack')
  const batch = JSON.parse(await readFile(batchPath, 'utf8'))
  const jobs = resolveWithin(projectRoot, config.jobsDir, 'jobsDir')
  const jobName = args.jobName ?? makeHistoricalJobName(batch)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(jobName)) {
    throw new Error('jobName contains unsupported characters')
  }
  const agentImportPath = config.historicalAgentImportPath
    ?? 'harbor_dsh_evolution.session_agent:SessionObservationAgent'
  const pluginImportPath = config.historicalPluginImportPath
    ?? 'dsh-historical-evaluation'
  const harborArgs = [
    'run', '-y', '-p', dataset,
    '-a', agentImportPath,
    '--job-name', jobName,
    '--jobs-dir', jobs,
    '--plugin', pluginImportPath,
    '--plugin-kwarg', `batch_path=${batchPath}`,
    '--plugin-kwarg', `dataset_path=${dataset}`,
    '--plugin-kwarg', `stack_path=${stack}`,
    '--plugin-kwarg', `project_root=${projectRoot}`,
    '--plugin-kwarg', 'mode=diagnostic',
  ]
  const lease = await modelRuntime.openLease(args.judgeBinding, {
    candidateDigest: batch.digest,
    jobName,
  })
  const jobDir = path.join(jobs, jobName)
  try {
    let processResult
    try {
      processResult = await runProcess(config.harborBin, harborArgs, {
        cwd: projectRoot,
        timeoutMs: config.timeoutMs,
        env: {
          ...process.env,
          ...(config.pythonPath ? { PYTHONPATH: config.pythonPath } : {}),
          HSE_JUDGE_GATEWAY_URL: lease.endpoint,
          HSE_JUDGE_GATEWAY_TOKEN: lease.token,
          HSE_JUDGE_GATEWAY_PROVIDER: lease.candidateProvider,
          HSE_JUDGE_GATEWAY_INFO: JSON.stringify({
            protocol: lease.protocol,
            candidate_digest: batch.digest,
            job: jobName,
            binding: {
              provider: args.judgeBinding.provider,
              model: args.judgeBinding.model,
              ...(args.judgeBinding.reasoning_effort === undefined
                ? {}
                : { reasoning_effort: args.judgeBinding.reasoning_effort }),
            },
            model_info: lease.modelInfo,
          }),
          HSE_JUDGE_GATEWAY_PROTOCOL: lease.protocol,
        },
      })
    } catch (error) {
      throw await explainHarborFailure(error, jobDir)
    }
    let summary
    let completion
    try {
      summary = JSON.parse(await readFile(path.join(jobDir, 'evaluation-summary.json'), 'utf8'))
      completion = JSON.parse(await readFile(path.join(jobDir, 'historical-evaluation-complete.json'), 'utf8'))
    } catch (error) {
      throw new Error(
        `HISTORICAL_JOB_INCOMPLETE: Harbor exited successfully but the Historical plugin did not write its summary/completion sentinel (${error.message})`,
      )
    }
    assertHistoricalCompletion(summary, completion, {
      jobName,
      batchDigest: batch.digest,
      batchId: batch.batch_id,
      recordCount: Array.isArray(batch.records) ? batch.records.length : undefined,
    })
    return {
      judgeModelBinding: {
        provider: args.judgeBinding.provider,
        model: args.judgeBinding.model,
        ...(args.judgeBinding.reasoning_effort === undefined
          ? {}
          : { reasoning_effort: args.judgeBinding.reasoning_effort }),
      },
      job: path.relative(projectRoot, jobDir).split(path.sep).join('/'),
      summary,
      completion,
      materialized: {
        dataset: path.relative(projectRoot, dataset).split(path.sep).join('/'),
        stack: path.relative(projectRoot, stack).split(path.sep).join('/'),
      },
      process: { code: processResult.code },
    }
  } finally {
    await lease.close()
  }
}

export async function readEvaluation(config, args) {
  const jobDir = resolveWithin(config.projectRoot, args.jobPath, 'jobPath')
  return JSON.parse(await readFile(path.join(jobDir, 'evaluation-summary.json'), 'utf8'))
}

export async function compareCandidates(config, args) {
  const baseline = resolveWithin(config.projectRoot, args.baselineJob, 'baselineJob')
  const candidate = resolveWithin(config.projectRoot, args.candidateJob, 'candidateJob')
  const policy = resolveWithin(config.projectRoot, args.policyPath, 'policyPath')
  return cliJson(config, ['promote', baseline, candidate, '--policy', policy], { allowedExitCodes: [0, 1] })
}
