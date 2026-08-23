# Progressive Project Initialization

Load this reference only when the project is missing the Evaluation Stack structure or the user asks to initialize it.

## User-facing concept card

Keep onboarding anchored on four visible concepts:

| User concept | Plain-language prompt | Accepted input | Compiled architecture |
| --- | --- | --- | --- |
| 评测集 (Dataset) | 测什么？ | One Query, file, instruction directory, or Dataset | Dataset tasks, manifest, population, diagnostic/regression mode |
| 生成器 (Generator) | 谁来回答？ | curl or local/detected Agent | Candidate snapshot, Integration, Renderer, runtime identity |
| 评测器（评测标准） (Evaluator) | 怎样算好？ | evaluator curl/path, or natural-language criteria | Evaluator, Rubric, Judge identity, Evaluation Contract |
| 优化器 (Optimizer) | 谁根据结果改进？ | current Agent, Codex, Claude Code, or local command | Optimizer identity, mutation surface, rollback workflow |

Inspect first and prefill everything reliable. Ask only about missing rows. Use `./harbor-evolution/` as the proposed managed workspace when no project exists, but do not write outside the Plugin's configured `projectRoot`; surface a configuration mismatch before initialization.

Before any write, show the four rows plus inferred workspace, diagnostic/promotion scope, and deferred capabilities. The user may start initialization, modify the card, or open advanced configuration.

## Internal compilation worksheet

The Agent, not the user, compiles the accepted concept card into the strict `harbor_evolution_init` arguments:

| Field | Required meaning |
| --- | --- |
| `datasetPath` | Existing Harbor Dataset inside `projectRoot` |
| `stackId` / `stackVersion` | Stable identity of the complete evaluation architecture |
| `datasetId` / `datasetVersion` | Stable identity of task population and GT boundary |
| `contractId` / `contractVersion` | Stable metric semantics |
| `primaryMetric` / `primaryDirection` | Exact reward key and `maximize` or `minimize` |
| Judge provider/model/version | Infer from the accepted Evaluator implementation; never persist credentials |
| Policy id/version | Stable Gate identity |
| `minImprovement` | Use only an explicitly accepted business delta for promotion; a diagnostic scaffold may use `0` and remain ineligible for promotion |

Derive ids from a stable project slug and start newly generated identities at `1.0.0`. Use `reward` with `maximize` only as a visible draft when the user's criteria describe answer quality. The initializer creates a minimal Policy; do not pass it to a `promotion-eligible` Job until the user accepts real thresholds, non-regression metrics, repeat policy, mutation boundaries, and promotion ownership.

Do not ask the user to name Integration, Renderer, Diagnoser, Runner, or Reporter during ordinary onboarding. Generate their identities and explain them only in advanced configuration or when Doctor finds a boundary problem.

If the Evaluator itself will be optimized, separately establish Ground Truth id/version, source kind (`human`, `programmatic`, `consensus`, `model`, or `external`), provenance, owner, Criteria, case population, and adjudication rule. Do not hide these semantics inside the Agent Dataset identity. Use `harbor_ground_truth_init` only after they are accepted.

## Generated layout

```text
projectRoot/
├── .harbor/
│   ├── evolution.yml
│   └── evaluation-stack.yml
├── candidates/
├── datasets/
├── integrations/default.py
├── renderers/default.py
├── evaluators/default.py
├── rubrics/default.md
├── diagnosers/default.py
├── optimizers/default.py
├── runners/harbor.py
├── reporters/default.py
├── policies/promotion.json
└── jobs/
```

The initializer never overwrites existing files. `created` and `preserved` in its result are part of the audit. Placeholder components provide identities, not a finished business evaluator.

## Evaluation Stack shape

```yaml
schema_version: 1
stack_id: vertical-search
version: 1.0.0
components:
  integration: { id: search-api, version: 1.0.0, entry: integrations/default.py }
  renderer: { id: search-renderer, version: 1.0.0, entry: renderers/default.py }
  evaluator: { id: search-evaluator, version: 1.0.0, entry: evaluators/default.py }
  rubric: { id: search-rubric, version: 1.0.0, entry: rubrics/default.md }
  diagnoser: { id: search-diagnoser, version: 1.0.0, entry: diagnosers/default.py }
  optimizer: { id: search-optimizer, version: 1.0.0, entry: optimizers/default.py }
  runner: { id: harbor-runner, version: 1.0.0, entry: runners/harbor.py, semantic: false }
  reporter: { id: search-reporter, version: 1.0.0, entry: reporters/default.py }
judge:
  provider: accepted-provider
  model: accepted-model
  version: pinned-version
  parameters: { temperature: 0 }
evaluation_contract:
  contract_id: vertical-search
  version: 1.0.0
  primary_metric: reward
  metrics:
    - { id: reward, label: Overall reward, direction: maximize }
    - { id: valid_search_rate, label: Valid search rate, direction: maximize }
    - { id: citation_accuracy, label: Citation accuracy, direction: maximize }
  hard_requirements:
    - { id: input_integrity }
    - { id: agent_completed }
    - { id: integration_valid }
    - { id: renderer_valid }
    - { id: judge_completed }
    - { id: artifact_schema_valid }
```

The validity requirements answer whether a quality score is admissible. They are separate from metric thresholds. Infrastructure and evaluation failures may retain raw verifier output for audit, but must emit `score.valid=false` and never enter Population aggregates.

Do not duplicate Evaluator logic inside each Task. Reference one Stack Evaluator from task metadata when task-specific routing is needed.

## Dataset rules

Keep `dataset-manifest.json` at Dataset root. Generate it through initialization or `harbor-dsh dataset snapshot`; do not hand-edit its digest. Validation rejects:

- Missing/duplicate Task ids or empty instructions.
- Duplicate normalized queries.
- Missing/out-of-root paths or symlinks.
- Source/file counts that no longer match.
- Secret-bearing metadata fields.

Intentional Dataset changes require a new Dataset version, a new snapshot, and a fresh baseline.

## Promotion Policy v2

```json
{
  "schema_version": 2,
  "policy_id": "vertical-search",
  "version": "1.0.0",
  "primary_metric": "reward",
  "primary_direction": "maximize",
  "min_improvement": 0.05,
  "minimums": { "citation_accuracy": 0.9 },
  "maximums": { "latency_seconds": 20 },
  "non_regression": ["valid_search_rate"],
  "metric_directions": { "valid_search_rate": "maximize" },
  "non_regression_tolerance": 0.0,
  "hard_requirements": ["exception_free", "artifact_schema_valid", "doctor_error_free"]
}
```

Use business-accepted thresholds. Do not assume all metrics are `/10`, maximized, or universal across domains.

## Handoff before the first Job

Show the user:

1. The accepted four-concept card and resolved paths.
2. Whether the run is a quick diagnostic or a promotion-eligible regression.
3. Any remaining choice that materially affects cost, safety, score meaning, or comparability.
4. Doctor findings and Context preview in plain language.

Put role identities, digests, metric directions, hard requirements, and generated defaults under an advanced/audit section. Do not make the user reconfirm unchanged internal fields.

Start with a baseline. Do not create Candidate v2 until baseline evidence supports one controlled hypothesis.

The first completed Job should produce `trial-lifecycle.json`, `trial-events.jsonl`, Trial Assessment v2 files, `artifact-registry.json`, Population Report v2, and Optimization Report v2. Treat missing 0.6 capabilities on older Jobs as read-only historical limitations, not synthetic defaults.
