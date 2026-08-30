# dsh-harbor-evolution

English | [中文](README.zh.md)

Installable DeepSeek Harness Plugin + Skill for running stable Harbor evaluation and controlled Agent evolution loops, with a native DSH Web dashboard.

The package gives DSH sixteen strict Harbor tools, dedicated Tool cards, a nine-stage Evaluation Workbench, an installation Doctor, and the model- and user-invocable `evolve-agent-with-harbor` Skill. The Skill starts with four user-facing concepts—Dataset (what to test), Generator (who answers), Evaluator plus criteria (what good means), and Optimizer (who improves it)—then compiles accepted choices into the strict Evaluation Stack. When no Dataset is supplied, it can instead preview recent completed DSH Sessions and evaluate each immutable Session as one Historical Trial without rerunning a Candidate. A DSH Generator may explicitly pin the current default model as a non-secret Candidate identity while retaining the per-Job Host Broker credential boundary. The Plugin validates Dataset identity, checks Trial Lifecycle and Score Validity, governs independent Ground Truth meta-evaluation, diagnoses evidence provenance, limits each iteration to one controlled Candidate change, and invokes the Promotion Gate only as an explicit action.

## Install

Requirements: Docker, Node.js 22+, pnpm, and [uv](https://docs.astral.sh/uv/). Run this from the business Agent workspace:

```bash
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

The setup command installs both required runtimes:

- `harbor-dsh-evolution==0.8.1` in a managed Python environment.
- `dsh-harbor-evolution@0.8.1` in the selected DSH profile.

It then stores the absolute Harbor executable paths and a fallback `projectRoot` in the profile's `harbor-evolution` block and verifies the integration. Agent Tool calls always use the calling session's absolute working directory as their project root; the configured value remains the Web Workbench and non-Agent fallback. Existing unrelated profile entries are preserved, and rerunning setup updates the same block.

Successful setup requires `harbor plugins list` to discover both `dsh-evolution` for Candidate Jobs and `dsh-historical-evaluation` for observe-existing Session Jobs.

The default profile is `web`. Use `--profile headless` only when that is the profile you actually run. See all options with:

```bash
npx --yes dsh-harbor-evolution@latest setup --help
```

Stop any old DSH process and run the exact restart command printed by setup. Then invoke:

```text
/evolve-agent-with-harbor
Inspect this workspace and help me clarify and initialize a stable Harbor self-evolution loop.
```

Users may provide a single Query or Dataset path, a Generator curl or local Agent path, an Evaluator curl/path or natural-language criteria, and an optional Optimizer such as Codex or Claude Code. The Skill inspects the workspace first, defaults the Optimizer to the current Agent, and shows one confirmation card before writing files. Evaluation Stack roles, ids, versions, Judge configuration, Contract, and Policy stay behind advanced configuration unless they materially affect a decision.

The Plugin registers:

- `harbor_candidate_snapshot`
- `harbor_model_binding`
- `harbor_evolution_init`
- `harbor_evolution_doctor`
- `harbor_quick_diagnostic_init`
- `harbor_session_diagnostic_preview`
- `harbor_session_diagnostic_run`
- `harbor_dataset_validate`
- `harbor_context_preview`
- `harbor_eval_run`
- `harbor_eval_result`
- `harbor_evaluator_inspect`
- `harbor_evaluator_update`
- `harbor_ground_truth_init`
- `harbor_evaluator_meta_evaluate`
- `harbor_candidate_compare`

In the `web` profile, the same package also registers:

- a localized nine-stage Workbench that directly exposes fixed experiment identities, Agent-visible Dataset queries/instructions, safe business-artifact previews, Ground Truth meta-evaluation, paginated per-Trial evidence and recommendations, Population validity/coverage, controlled optimization hypotheses, and Baseline/Gate deltas; raw JSON remains in the audit drawer;
- descriptor-authorized Evaluator/Rubric source editing for `script` and `llm-as-judge` implementations, with optimistic concurrency and mandatory new identities;
- a `harbor-dsh-evaluator/v1` interface shared by deterministic scripts and LLM-as-Judge implementations;
- compact result cards for all Harbor Tool calls;
- a `Harbor Evolution` Settings section that checks the configured project, Evaluation Stack, Jobs directory, and CLI paths, supports process-local `projectRoot` reload, and checks npm for a newer formal release without silently installing it.

The Web UI is intentionally read-only. Starting an evaluation or deciding promotion remains an explicit Agent + Skill workflow, so a page refresh can never launch an expensive Job.

A direct evaluation requires `candidatePath`, `datasetPath`, `stackPath`, and explicit `mode`; `promotion-eligible` additionally requires `policyPath`. Prefer the Skill because it will not run or compare Jobs until the material identities and evaluation contract are resolved.

## Historical Session cold start

When the user does not provide a Dataset, the Skill first calls `harbor_session_diagnostic_preview` for up to ten recent completed business Sessions from the Agent's exact working directory. Preview returns only safe metadata and a short-lived confirmation token. Its confirmation card identifies the Evaluator and Judge, discloses same-model coupling and estimated requests, and warns that redacted evidence will remain under `.harbor/private` and `jobs`; it never exposes raw Session ids or transcripts.

After explicit confirmation, `harbor_session_diagnostic_run` receives only the `selectionToken` and an optional Job name. It revalidates the frozen Session and Feedback digests, materializes an immutable Historical Batch plus matching Dataset and Stack, and evaluates one Session Observation per Harbor Trial. The Job does not rerun a Candidate, cannot enter Promotion Gate, and records Evaluator Meta-Evaluation as `not-run` because evaluator reliability requires a separate independent Ground Truth workflow.

A Historical Trial may finish as `completed-unscored` when required evidence is insufficient. That is a normal Evaluator abstention, not a zero score or infrastructure failure; use Trial and Criterion coverage to interpret the result.

## Candidate model binding

Before each Job, the Plugin snapshots the current DSH Agent selection—provider, model, and reasoning effort—then starts a per-Job local Model Broker. The Candidate uses the temporary `dsh-host` adapter through `dsh-host-broker` / `dsh-host-model-gateway/v1`; it receives only a short-lived Job capability file, never GPT Auth, Codex OAuth, or an upstream API key.

`harbor_eval_run`, `harbor_context_preview`, and `harbor_evolution_doctor` inherit that selection by default. Advanced callers can override `candidateProvider` and `candidateModel` only as a pair, plus an optional `candidateReasoningEffort`. `openai-codex` performs a GPT Auth sign-in check before Harbor starts. The resulting model binding is part of Context v2 comparison identity, so any provider/model/reasoning change requires a new baseline.

`harbor_model_binding` returns the current default selection as a credential-free `model-binding.json` draft. Once included before Candidate snapshot, it enters the Candidate digest and becomes the required Job model identity. Conflicting Job or Plugin overrides fail before Harbor starts. Even for `openai-codex`, the Candidate receives only the short-lived Broker capability—never the Host OAuth file or an upstream API key.

When Settings opens, the Host performs a bounded npm registry check and caches successful results. An available release is shown with its exact installer command and release link. The browser never installs, rewrites a DSH profile, or restarts DSH; registry failures are non-blocking.

`harbor_eval_result` defaults to the stable Summary. Use `view=job`, `view=dataset`, `view=progress`, `view=trial` plus a returned `trialId`, or `view=governance` to inspect sanitized instructions, generated output, evidence, and evaluator source without coupling the Agent to artifact file paths.

## What setup writes

The selected profile receives one id-targeted override:

```yaml
- id: harbor-evolution
  config:
    projectRoot: /workspace/my-agent
    jobsDir: jobs
    harborBin: /managed/runtime/.venv/bin/harbor
    harborDshBin: /managed/runtime/.venv/bin/harbor-dsh
    pythonPath: ""
```

Keep `pythonPath` empty for the published Python package. For Agent Tool calls, `projectRoot` is replaced by the calling session's working directory for that call. `candidatePath`, `datasetPath`, `jobPath`, and `policyPath` remain constrained to that request-local root, so concurrent sessions cannot redirect each other's Harbor operations.

For source development from the repository:

```bash
./hse dsh-install-source web
```

Do not use `dsh plugin add ./packages/dsh-plugin` directly from a fresh checkout. pnpm records a `link:` dependency, and Node resolves imports from the real checkout path. The source installer first runs the package's locked `npm ci`, builds the portable Web client with its embedded ocean artwork, then links it and installs the local Python Adapter. Normal users should always use the registry-backed setup command above.

See the [complete DSH Web quickstart](https://github.com/istarwyh/harbor-self-evolving/blob/main/docs/dsh-web-quickstart.md) for UI verification, first evaluation, Candidate comparison, and troubleshooting.

The Plugin never deploys a Candidate or mutates the active Champion. Existing CI/CD remains responsible for building, deploying, and promoting the exact evaluated artifact.
