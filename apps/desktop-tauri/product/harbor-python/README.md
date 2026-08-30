# harbor-dsh-evolution

English | [中文](README.zh.md)

Harbor-side integration for both DeepSeek Harness Candidate evaluation and privacy-preserving Historical Generation Evaluation.

It provides:

- `DshCandidateAgent`: verifies and uploads an immutable Candidate, installs its locked npm dependencies, and runs it through Harbor's ACP runner.
- `EvolutionPlugin`: binds each Job to Candidate, Dataset Manifest, Evaluation Stack Manifest, Context v2, Architecture Doctor, Trial assessments, Population report, and Summary.
- `SessionObservationAgent`: presents one frozen, redacted DSH Session Observation as one deterministic Harbor Trial without rerunning a Candidate.
- `HistoricalGenerationEvaluationPlugin`: validates the immutable Historical Batch/Dataset/Stack cross-links, runs Evaluator v2, preserves `completed-unscored` abstention, and writes Summary v4 plus a strict completion sentinel. Historical Jobs are diagnostic and cannot enter Promotion Gate.
- `harbor-dsh`: initializes strict projects; validates/snapshots Candidates, Datasets, and Stacks; materializes Historical Batch inputs; previews Context v2; diagnoses architecture; summarizes Jobs; and runs the deterministic Promotion Gate.

Install it into the same Python environment as Harbor so the plugin entry point is discoverable:

```bash
uv venv .venv
uv pip install --python .venv/bin/python harbor-dsh-evolution==0.8.1
source .venv/bin/activate
harbor plugins list
harbor-dsh --help
```

The plugin list must contain both entry points:

```text
dsh-evolution
dsh-historical-evaluation
```

Development from this repository:

```bash
uv sync
uv run harbor plugins list
uv run harbor-dsh --help
uv run harbor-dsh historical --help
uv run harbor-dsh dataset validate ../../examples/deep-research/task --project-root ../..
uv run harbor-dsh stack validate ../../examples/deep-research/.harbor/evaluation-stack.yml --project-root ../..
uv run pytest
uv build
```

Harbor and this package must be installed into the same Python environment for the `dsh-evolution` and `dsh-historical-evaluation` entry points to appear in `harbor plugins list`.

`snapshot` derives Candidate id and version from `package.json` unless explicitly supplied. Context v1 is not accepted. Candidate promotion requires Context v2 and emits structured mismatch, artifact, infrastructure, metric, and regression reason codes. Historical materialization instead derives a matching Dataset and immutable Stack from a redacted `historical-generation-batch/v1`; it never creates a Candidate identity, reports insufficient evidence as `completed-unscored`, and always returns `UNSUPPORTED_JOB_KIND_FOR_PROMOTION` if passed to Gate.
