import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { MANIFEST_NAME, snapshotCandidate } from './candidate.js'
import { runProcess } from './process.js'

export function resolveWithin(root, value, label) {
  const base = path.resolve(root)
  const resolved = path.resolve(base, value)
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`${label} must stay under projectRoot`)
  }
  return resolved
}

export async function snapshot(config, args) {
  const candidateDir = resolveWithin(config.projectRoot, args.candidatePath, 'candidatePath')
  return snapshotCandidate(candidateDir, {
    candidateId: args.candidateId,
    version: args.version,
    runtimeVersion: config.dshVersion,
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
  ])
}

export async function runDoctor(config, args) {
  const inputs = strictInputs(config, { ...args, mode: args.mode ?? 'diagnostic' })
  const command = ['doctor', '--architecture', '--project-root', inputs.projectRoot, '--stack', inputs.stack, '--dataset', inputs.dataset]
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
  ])
  return { manifest, ...preview }
}

export async function runEvaluation(config, args) {
  const manifest = await snapshot(config, args)
  const inputs = strictInputs(config, args)
  const datasetValidation = await validateDataset(config, args)
  if (!datasetValidation.valid) {
    throw new Error(`Dataset validation failed: ${datasetValidation.findings.map(item => item.code).join(', ')}`)
  }
  const doctor = await runDoctor(config, args)
  if (inputs.mode === 'promotion-eligible' && !doctor.promotion_ready) {
    throw new Error(`Architecture Doctor blocked promotion-eligible Job: ${doctor.findings.filter(item => item.level === 'error').map(item => item.code).join(', ')}`)
  }
  const preview = await cliJson(config, [
    'context', 'preview', '--project-root', inputs.projectRoot,
    '--candidate', inputs.candidate, '--dataset', inputs.dataset,
    '--stack', inputs.stack, '--jobs-dir', inputs.jobs, '--mode', inputs.mode,
  ])
  const jobName = args.jobName ?? makeJobName(manifest)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(jobName)) throw new Error('jobName contains unsupported characters')

  const harborArgs = [
    'run', '-p', inputs.dataset,
    '-a', config.agentImportPath,
    '--ak', `candidate_path=${inputs.candidate}`,
    '--ak', `candidate_version=${manifest.version}`,
    '--ak', `candidate_digest=${manifest.digest}`,
    '--job-name', jobName,
    '--jobs-dir', inputs.jobs,
    '--plugin', config.pluginImportPath,
    '--plugin-kwarg', `candidate_manifest=${path.join(inputs.candidate, MANIFEST_NAME)}`,
    '--plugin-kwarg', `dataset_path=${inputs.dataset}`,
    '--plugin-kwarg', `stack_path=${inputs.stack}`,
    '--plugin-kwarg', `project_root=${inputs.projectRoot}`,
    '--plugin-kwarg', `mode=${inputs.mode}`,
  ]
  if (inputs.policy) harborArgs.push('--plugin-kwarg', `policy_path=${inputs.policy}`)
  const processResult = await runProcess(config.harborBin, harborArgs, {
    cwd: config.projectRoot,
    timeoutMs: config.timeoutMs,
    env: { ...process.env, ...(config.pythonPath ? { PYTHONPATH: config.pythonPath } : {}) },
  })
  const jobDir = path.join(inputs.jobs, jobName)
  const summary = JSON.parse(await readFile(path.join(jobDir, 'evaluation-summary.json'), 'utf8'))
  return {
    manifest,
    job: path.relative(inputs.projectRoot, jobDir),
    summary,
    doctor,
    contextPreview: preview,
    process: { code: processResult.code },
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
