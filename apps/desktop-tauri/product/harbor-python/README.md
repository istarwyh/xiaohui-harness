# harbor-dsh-evolution

English | [中文](README.zh.md)

Harbor-side integration for DeepSeek Harness Candidate evolution.

It provides:

- `DshCandidateAgent`: verifies and uploads an immutable Candidate, checks the XiaoHui Host model broker from the task container, generates an ephemeral Cordis model-binding overlay, installs locked npm dependencies, and runs the result through Harbor's ACP runner without copying reusable provider credentials.
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

The model broker URL, Job capability, protocol, and model metadata are injected by `dsh-harbor-evolution` when it starts Harbor. Direct `harbor run` callers must provide that internal contract themselves; it is not a second end-user credential surface. The generated `.harbor-runtime` directory is reserved and excluded from Candidate snapshots.
