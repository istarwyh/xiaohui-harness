# dsh-harbor-evolution

English | [中文](README.zh.md)

Installable DeepSeek Harness Plugin + Skill for running stable Harbor evaluation and controlled Agent evolution loops, with a native DSH Web dashboard.

The package gives DSH twelve strict Harbor tools, dedicated Tool cards, a nine-stage Evaluation Workbench, an installation Doctor, and the model- and user-invocable `evolve-agent-with-harbor` Skill. The Skill starts with four user-facing concepts—Dataset (what to test), Generator (who answers), Evaluator plus criteria (what good means), and Optimizer (who improves it)—then compiles accepted choices into the strict Evaluation Stack. It validates Dataset identity, checks Trial Lifecycle and Score Validity, governs independent Ground Truth meta-evaluation, diagnoses evidence provenance, limits each iteration to one controlled Candidate change, and invokes the Promotion Gate only as an explicit action.

## Install

Requirements: Docker, Node.js 22+, pnpm, and [uv](https://docs.astral.sh/uv/). Run this from the business Agent workspace:

```bash
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

The setup command installs both required runtimes:

- `harbor-dsh-evolution==0.7.2` in a managed Python environment.
- `dsh-harbor-evolution@0.7.2` in the selected DSH profile.

It then stores the absolute Harbor executable paths and a fallback `projectRoot` in the profile's `harbor-evolution` block and verifies the integration. Agent Tool calls always use the calling session's absolute working directory as their project root; the configured value remains the Web Workbench and non-Agent fallback. Existing unrelated profile entries are preserved, and rerunning setup updates the same block.

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
- `harbor_evolution_init`
- `harbor_evolution_doctor`
- `harbor_dataset_validate`
- `harbor_context_preview`
- `harbor_eval_run`
- `harbor_eval_result`
- `harbor_candidate_compare`

In the `web` profile, the same package also registers:

- a localized nine-stage Workbench that directly exposes fixed experiment identities, Agent-visible Dataset queries/instructions, safe business-artifact previews, Ground Truth meta-evaluation, paginated per-Trial evidence and recommendations, Population validity/coverage, controlled optimization hypotheses, and Baseline/Gate deltas; raw JSON remains in the audit drawer;
- descriptor-authorized Evaluator/Rubric source editing for `script` and `llm-as-judge` implementations, with optimistic concurrency and mandatory new identities;
- a `harbor-dsh-evaluator/v1` interface shared by deterministic scripts and LLM-as-Judge implementations;
- compact result cards for all Harbor Tool calls;
- a `Harbor Evolution` Settings section that checks the configured project, Evaluation Stack, Jobs directory, and CLI paths.

The Web UI is intentionally read-only. Starting an evaluation or deciding promotion remains an explicit Agent + Skill workflow, so a page refresh can never launch an expensive Job.

A direct evaluation requires `candidatePath`, `datasetPath`, `stackPath`, and explicit `mode`; `promotion-eligible` additionally requires `policyPath`. Prefer the Skill because it will not run or compare Jobs until the material identities and evaluation contract are resolved.

## Candidate model binding

Before each Job, the Plugin snapshots the current DSH Agent selection—provider, model, and reasoning effort—then starts a per-Job local Model Broker. The Candidate uses the temporary `dsh-host` adapter through `dsh-host-broker` / `dsh-host-model-gateway/v1`; it receives only a short-lived Job capability file, never GPT Auth, Codex OAuth, or an upstream API key.

`harbor_eval_run`, `harbor_context_preview`, and `harbor_evolution_doctor` inherit that selection by default. Advanced callers can override `candidateProvider` and `candidateModel` only as a pair, plus an optional `candidateReasoningEffort`. `openai-codex` performs a GPT Auth sign-in check before Harbor starts. The resulting model binding is part of Context v2 comparison identity, so any provider/model/reasoning change requires a new baseline.

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
