import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadBundledSkill } from './lib/official-skill.js'
import { CandidateModelRuntime } from './lib/model-runtime.js'
import { EvolutionService } from './lib/service.js'
import { installDashboardWeb } from './lib/web.js'

export const name = 'harbor-evolution'
export const inject = ['tools', 'skills', 'llm', 'agentDefaultModel']

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const checkoutPythonPackage = path.resolve(packageDir, '../harbor-plugin')
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

function checkoutExecutable(name) {
  const candidate = path.join(checkoutPythonPackage, '.venv', 'bin', name)
  return existsSync(candidate) ? candidate : name
}

export const Config = Schema.object({
  projectRoot: Schema.string().default('.'),
  jobsDir: Schema.string().default('jobs'),
  harborBin: Schema.string().default(''),
  harborDshBin: Schema.string().default(''),
  dshVersion: Schema.string().default('0.1.0-rc.6'),
  agentImportPath: Schema.string().default('harbor_dsh_evolution.agent:DshCandidateAgent'),
  pluginImportPath: Schema.string().default('dsh-evolution'),
  pythonPath: Schema.string().default(''),
  timeoutMs: Schema.number().default(1800000),
  candidateProvider: Schema.string().default(''),
  candidateModel: Schema.string().default(''),
  candidateReasoningEffort: Schema.string().default(''),
  modelBrokerBindHost: Schema.string().default('127.0.0.1'),
  modelBrokerAdvertisedHost: Schema.string().default('host.docker.internal'),
  modelBrokerMaxRequests: Schema.number().min(1).default(1000),
  modelBrokerMaxRequestBytes: Schema.number().min(1024).default(33554432),
})

function jsonTool(definition, execute) {
  return defineTool({
    ...definition,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      return JSON.stringify(await execute(args, exec), null, 2)
    },
  })
}

function toolProjectRoot(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) {
    throw new Error('Harbor tools require an Agent session with an absolute working directory')
  }
  return path.resolve(cwd)
}

export function apply(ctx, config) {
  const resolved = {
    ...config,
    projectRoot: path.resolve(config.projectRoot),
    harborBin: config.harborBin || process.env.HARBOR_BIN || checkoutExecutable('harbor'),
    harborDshBin: config.harborDshBin || process.env.HARBOR_DSH_BIN || checkoutExecutable('harbor-dsh'),
    pythonPath: config.pythonPath || (
      existsSync(path.join(checkoutPythonPackage, 'src'))
        ? path.join(checkoutPythonPackage, 'src')
        : ''
    ),
  }
  const modelRuntime = new CandidateModelRuntime(ctx, resolved)
  const metadata = { pluginVersion: packageJson.version }
  const service = new EvolutionService(resolved, metadata, modelRuntime)
  const serviceForTool = exec => new EvolutionService({
    ...resolved,
    projectRoot: toolProjectRoot(exec),
  }, metadata, modelRuntime)

  ctx.skills.register(loadBundledSkill())
  installDashboardWeb(ctx, service)

  ctx.tools.register(jsonTool({
    name: 'harbor_candidate_snapshot',
    description: 'Freeze a DeepSeek Harness Cordis composition as an immutable Candidate manifest. Candidate id and version default to package.json.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      candidateId: { type: 'string' },
      version: { type: 'string' },
    },
  }, (args, exec) => serviceForTool(exec).snapshot(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_evolution_init',
    description: 'Compile an accepted Dataset, Generator, Evaluator/criteria, and Optimizer onboarding card into a strict, non-overwriting Evaluation Stack project. Detailed identity fields are internal tool inputs, not a user questionnaire.',
    parameters: {
      datasetPath: { type: 'string', required: true },
      stackId: { type: 'string', required: true },
      stackVersion: { type: 'string', required: true },
      datasetId: { type: 'string', required: true },
      datasetVersion: { type: 'string', required: true },
      contractId: { type: 'string', required: true },
      contractVersion: { type: 'string', required: true },
      primaryMetric: { type: 'string', required: true },
      primaryDirection: { type: 'string', required: true },
      judgeProvider: { type: 'string', required: true },
      judgeModel: { type: 'string', required: true },
      judgeVersion: { type: 'string', required: true },
      policyId: { type: 'string', required: true },
      policyVersion: { type: 'string', required: true },
      minImprovement: { type: 'number', required: true },
    },
  }, (args, exec) => serviceForTool(exec).initialize(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_evolution_doctor',
    description: 'Validate the Evaluation Stack architecture, Dataset manifest, Candidate, and optional Promotion Policy before an expensive Harbor Job.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      datasetPath: { type: 'string', required: true },
      stackPath: { type: 'string', required: true },
      policyPath: { type: 'string' },
      mode: { type: 'string', required: true },
      candidateProvider: { type: 'string', description: 'Optional Candidate provider. Supply it together with candidateModel; defaults to the current DSH Agent model.' },
      candidateModel: { type: 'string' },
      candidateReasoningEffort: { type: 'string' },
    },
  }, (args, exec) => serviceForTool(exec).doctor(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_dataset_validate',
    description: 'Validate dataset-manifest.json, task uniqueness, instructions, paths, sensitive metadata, and the immutable source digest.',
    parameters: {
      datasetPath: { type: 'string', required: true },
    },
  }, (args, exec) => serviceForTool(exec).validateDataset(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_context_preview',
    description: 'Preview Evaluation Context v2 and find comparable baselines before launching a Job.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      candidateId: { type: 'string' },
      version: { type: 'string' },
      datasetPath: { type: 'string', required: true },
      stackPath: { type: 'string', required: true },
      mode: { type: 'string', required: true },
      candidateProvider: { type: 'string', description: 'Optional Candidate provider. Supply it together with candidateModel; defaults to the current DSH Agent model.' },
      candidateModel: { type: 'string' },
      candidateReasoningEffort: { type: 'string' },
    },
  }, (args, exec) => serviceForTool(exec).previewContext(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_eval_run',
    description: 'Run a strict diagnostic or promotion-eligible Harbor Job bound to Candidate, Dataset Manifest, Evaluation Stack, and Context v2 identities.',
    parameters: {
      candidatePath: { type: 'string', required: true },
      candidateId: { type: 'string' },
      version: { type: 'string' },
      datasetPath: { type: 'string', required: true },
      stackPath: { type: 'string', required: true },
      mode: { type: 'string', required: true },
      policyPath: { type: 'string' },
      jobName: { type: 'string' },
      candidateProvider: { type: 'string', description: 'Optional Candidate provider. Supply it together with candidateModel; defaults to the current DSH Agent model and is frozen before the Job starts.' },
      candidateModel: { type: 'string' },
      candidateReasoningEffort: { type: 'string' },
    },
  }, (args, exec) => serviceForTool(exec).run(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_eval_result',
    description: 'Read a stable Job summary or a sanitized Workbench, Dataset instruction, Trial output/evidence, progress, or Evaluator governance view. Invalid scores remain distinct from raw verifier rewards.',
    parameters: {
      jobPath: { type: 'string', required: true },
      view: { type: 'string', description: 'summary (default), job, dataset, progress, trial, or governance' },
      trialId: { type: 'string', description: 'Required only for view=trial; use an id returned by the Job/Progress view' },
      compareJob: { type: 'string', description: 'Optional previous Job for view=governance impact analysis' },
      since: { type: 'string', description: 'Optional ISO timestamp for incremental progress changes' },
    },
  }, (args, exec) => serviceForTool(exec).result(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_evaluator_inspect',
    description: 'Inspect the active harbor-dsh-evaluator/v1 descriptor, implementation kind, ternary Criteria, and safely editable source files.',
    parameters: {
      stackPath: { type: 'string', description: 'Defaults to .harbor/evaluation-stack.yml' },
    },
  }, (args, exec) => serviceForTool(exec).evaluatorInspect(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_evaluator_update',
    description: 'Update one descriptor-authorized Evaluator source file with optimistic concurrency. Requires new Evaluator and Stack identities and never runs evaluation or Gate automatically.',
    parameters: {
      stackPath: { type: 'string', description: 'Defaults to .harbor/evaluation-stack.yml' },
      filePath: { type: 'string', required: true },
      content: { type: 'string', required: true },
      expectedDigest: { type: 'string', required: true },
      newEvaluatorVersion: { type: 'string', required: true },
      newStackVersion: { type: 'string', required: true },
    },
  }, (args, exec) => serviceForTool(exec).evaluator(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_ground_truth_init',
    description: 'Create a non-overwriting Ground Truth draft for evaluator meta-evaluation. GT may be human, programmatic, consensus, model, or external, but must have explicit provenance and remain independent of the Candidate evaluator.',
    parameters: {
      outputPath: { type: 'string', description: 'Defaults to .harbor/ground-truth.json' },
      groundTruthId: { type: 'string', required: true },
      version: { type: 'string', required: true },
      sourceKind: { type: 'string', required: true, description: 'human, programmatic, consensus, model, or external' },
      sourceDescription: { type: 'string', required: true },
      provenance: { type: 'string', required: true },
      criteria: { type: 'string', required: true, description: 'Comma-separated criterion ids' },
    },
  }, (args, exec) => serviceForTool(exec).groundTruthInitialize(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_evaluator_meta_evaluate',
    description: 'Compare repeated evaluator-observations/v1 with independent ground-truth/v1 and write an ESF, SCE, and RCR meta-evaluation report.',
    parameters: {
      groundTruthPath: { type: 'string', description: 'Defaults to .harbor/ground-truth.json' },
      observationsPath: { type: 'string', required: true },
      outputPath: { type: 'string', description: 'Defaults to .harbor/meta-evaluation-report.json' },
    },
  }, (args, exec) => serviceForTool(exec).evaluatorMetaEvaluate(args)))

  ctx.tools.register(jsonTool({
    name: 'harbor_candidate_compare',
    description: 'Apply the deterministic Promotion Gate to a baseline Job and a Candidate Job.',
    parameters: {
      baselineJob: { type: 'string', required: true },
      candidateJob: { type: 'string', required: true },
      policyPath: { type: 'string', required: true },
    },
  }, (args, exec) => serviceForTool(exec).compare(args)))
}
