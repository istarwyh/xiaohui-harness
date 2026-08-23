# harbor-dsh-evolution

English | [中文](README.zh.md)

Harbor-side integration for DeepSeek Harness Candidate evolution.

It provides:

- `DshCandidateAgent`: verifies and uploads an immutable Candidate, installs its locked npm dependencies, and runs it through Harbor's ACP runner.
- `EvolutionPlugin`: binds each Job to Candidate, Dataset Manifest, Evaluation Stack Manifest, Context v2, Architecture Doctor, Trial assessments, Population report, and Summary.
- `harbor-dsh`: initializes strict projects; validates/snapshots Candidates, Datasets, and Stacks; previews Context v2; diagnoses architecture; summarizes Jobs; and runs the deterministic Promotion Gate.

Install it into the same Python environment as Harbor so the plugin entry point is discoverable:

```bash
uv venv .venv
uv pip install --python .venv/bin/python harbor-dsh-evolution
source .venv/bin/activate
harbor plugins list
harbor-dsh --help
```

Development from this repository:

```bash
uv sync
uv run harbor plugins list
uv run harbor-dsh --help
uv run harbor-dsh dataset validate ../../examples/deep-research/task --project-root ../..
uv run harbor-dsh stack validate ../../examples/deep-research/.harbor/evaluation-stack.yml --project-root ../..
uv run pytest
uv build
```

Harbor and this package must be installed into the same Python environment for the `dsh-evolution` entry point to appear in `harbor plugins list`.

`snapshot` derives Candidate id and version from `package.json` unless explicitly supplied. Context v1 is not accepted. Promotion requires Context v2 and emits structured mismatch, artifact, infrastructure, metric, and regression reason codes.
