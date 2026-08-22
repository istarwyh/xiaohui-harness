# Strict Project Initialization

Load this reference only when the project is missing the Evaluation Stack structure or the user asks to initialize it.

## Readiness worksheet

Resolve every value before calling `harbor_evolution_init`:

| Field | Required meaning |
| --- | --- |
| `datasetPath` | Existing Harbor Dataset inside `projectRoot` |
| `stackId` / `stackVersion` | Stable identity of the complete evaluation architecture |
| `datasetId` / `datasetVersion` | Stable identity of task population and GT boundary |
| `contractId` / `contractVersion` | Stable metric semantics |
| `primaryMetric` / `primaryDirection` | Exact reward key and `maximize` or `minimize` |
| Judge provider/model/version | Reproducible Judge identity, never credentials |
| Policy id/version | Stable Gate identity |
| `minImprovement` | Accepted primary-metric delta |

Also establish diagnostic metrics, min/max thresholds, non-regression metrics, mutation surface, repeat policy, and promotion owner. The initializer creates a minimal Policy; update its explicit placeholders before a formal Gate.

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

1. Resolved Candidate, Dataset, Stack, Policy, and Jobs paths.
2. Role identities and which ones affect reward comparability.
3. Metric directions, thresholds, groups, and hard requirements.
4. Holdout, mutation, side-effect, repeat, and deployment boundaries.
5. Doctor findings and Context preview.

Start with a baseline. Do not create Candidate v2 until baseline evidence supports one controlled hypothesis.

The first completed Job should produce `trial-lifecycle.json`, `trial-events.jsonl`, Trial Assessment v2 files, `artifact-registry.json`, Population Report v2, and Optimization Report v2. Treat missing 0.6 capabilities on older Jobs as read-only historical limitations, not synthetic defaults.
