---
name: evolve-agent-with-harbor
description: Architect, initialize, run, diagnose, compare, and safely improve a DeepSeek Harness business Agent with Harbor Trial Lifecycle, Score Validity, Evidence Provenance, Evaluation Stack, Context v2, Architecture Doctor, and explicit Promotion Gate. Use for Harbor setup, Agent self-evolution, vertical-search evaluation loops, running Job inspection, failed Trial diagnosis, Candidate optimization, evaluator governance or meta-evaluation, and promotion decisions.
---

# Evolve Agent With Harbor

Build a reproducible improvement loop around three boundaries:

- **Generator/Candidate**: the immutable DSH Agent composition being improved.
- **Evaluator/Evaluation Stack**: Integration, Renderer, Evaluator, Rubric, Diagnoser, Optimizer, Runner, Reporter, and Judge identities.
- **Optimizer**: proposes one evidence-linked Candidate change; it never controls the final Gate.

Treat Harbor as the experiment boundary. Deployment, CI/CD, and Champion replacement remain external actions requiring separate authority.

## Select the narrowest mode

- **Clarify**: define progress, identities, constraints, and promotion ownership.
- **Architecture**: inspect role boundaries and run `harbor_evolution_doctor`.
- **Initialize**: read `references/initialization.md`, obtain explicit values, then call `harbor_evolution_init`.
- **Diagnostic**: investigate failures without making a promotion claim.
- **Promotion**: run a `promotion-eligible` Job and apply the deterministic Gate.
- **Evolve**: baseline → diagnose → one controlled change → regression Job → Gate.
- **Meta-evaluate**: improve an Evaluator/Judge against independently maintained human GT.
- **Govern**: inspect Evaluator/Rubric/Judge source and identities; preview whether a change requires a fresh baseline.

Do not turn an inspection or diagnostic request into Agent mutation or deployment.

## Clarify before initializing

Inspect the workspace first. Resolve only material gaps, preferably in no more than three grouped questions. Obtain:

1. Business behavior, failure pattern, and Candidate path/product identity.
2. Dataset path/id/version, task population, holdout boundary, and side-effect sandbox.
3. Evaluation Stack id/version and one entry for every required role.
4. Judge provider/model/version/parameters without credentials.
5. Evaluation Contract id/version, primary metric and direction, diagnostic metrics, groups, and hard requirements.
6. Promotion Policy id/version, delta, minimums, maximums, non-regression metrics, and metric directions.
7. Baseline Job/Candidate, repeat policy, run budget, stopping rule, allowed mutation surface, and forbidden files.
8. Promotion owner and external CI/CD handoff.

Never invent GT, a Judge model, reward definitions, thresholds, credentials, or deployment authority. Offer draft values only when clearly labeled and accepted.

## Enforce the strict architecture

Require these before every Job:

- `candidate-manifest.json` verified against the Candidate files.
- `dataset-manifest.json` with unique task ids, non-empty instructions, safe paths, and a matching source digest.
- `.harbor/evaluation-stack.yml` with all eight roles, Judge identity, and Evaluation Contract.
- Evaluation Context v2 preview.

Require `input_integrity`, `agent_completed`, `integration_valid`, `renderer_valid`, `judge_completed`, and `artifact_schema_valid` in the Trial validity contract. Specify which failures are hard requirements. Never infer that a numeric raw verifier reward is a valid Candidate quality score.

Before a formal Job, call in order:

1. `harbor_candidate_snapshot`
2. `harbor_dataset_validate`
3. `harbor_evolution_doctor`
4. `harbor_context_preview`

Do not launch a `promotion-eligible` Job when Doctor reports an error, no comparable baseline exists, or `fresh_baseline_required` is true. A diagnostic Job may investigate architecture warnings, but still requires a valid Candidate, Dataset Manifest, Evaluation Stack, and Context v2.

Keep Runner orchestration-only. Treat these as architecture errors:

- Runner combines HTTP integration, rubric, and Judge logic.
- Runner makes a promotion/Champion decision.

## Initialize without overwriting

Read `references/initialization.md` when required files are missing. After the user accepts all required identities and metric semantics, call `harbor_evolution_init`. It preserves existing files and creates explicit placeholders that still require business implementation.

After initialization:

- Replace placeholders with real role implementations.
- Pin Candidate dependencies and keep secrets runtime-injected.
- Re-snapshot the Dataset after intentional Dataset changes.
- Run Doctor again; initialization success is not evaluation readiness.

## Determine comparability correctly

Use the Context v2 `digest`, not timestamps or Job names.

A fresh baseline is required when any of these change:

- Dataset id, version, or source digest.
- Integration, Renderer, Evaluator, or Rubric identity.
- Judge provider, model, version, or parameters.
- Runner marked `semantic: true`.
- Harbor or integration runtime identity.

Diagnoser, Optimizer, Reporter, and non-semantic Runner changes remain comparable but change the full audit digest. A Candidate digest must differ from the baseline Candidate digest. Promotion Policy is reapplied as a separately versioned decision contract; changing it does not rewrite Evaluation Context.

## Run the evolution loop

### Establish a baseline

Call `harbor_eval_run` with Candidate, Dataset, Stack, explicit `mode`, and a Policy for `promotion-eligible`. Preserve Candidate, Dataset, Stack, Context, Doctor, Contract, Trial assessments, Population report, Summary, and later Promotion report.

Never cherry-pick stochastic runs. Apply the accepted repeat/seed policy symmetrically.

### Diagnose before changing

Use `harbor_eval_result` to reopen evidence without guessing local artifact paths: default `view=summary`, `view=job` for capabilities and stage artifacts, `view=dataset` for Agent-visible instructions, `view=progress` while running, `view=trial` with a returned `trialId` for the generated output and sanitized evidence, and `view=governance` for Evaluator/Rubric/Judge source and upgrade impact. Inspect in this order:

1. Confirm every Dataset item reached a terminal Trial state. Running, queued, cancelled, or missing Trials are not quality evidence.
2. Check `score.valid` and every validity requirement. Display an invalid score as `—`, never `0`.
3. Inspect evidence provenance. Keep `Real Renderer`, `ACP Agent Output Fallback`, raw transport evidence, Judge explanation, and deterministic diagnosis distinct.
4. Inspect findings, recommendations, user-visible output, criteria, and timing.
5. Classify the owning layer before proposing a mutation.

Treat `raw_rewards` as audit-only when `score.valid=false`. Aggregate and compare only valid quality scores. Inspect Trial assessments and classify each failure as:

- Candidate capability or policy.
- Tool-call, invalid search, citation, or output-contract failure.
- Dataset, Evaluator, Rubric, Judge, or GT defect.
- Infrastructure, dependency, permission, timeout, or deployment failure.
- Stochastic uncertainty.

Do not optimize the Candidate around broken evaluation infrastructure. Never leak holdout answers or GT into Candidate prompts, skills, tools, or memory.

Use the formal terminal states precisely:

- `candidate-quality-failed`: valid execution reached evaluation, but a Candidate-owned hard requirement failed.
- `infrastructure-error`: dependency, sandbox, permission, transport, timeout, or runtime failure; no Candidate quality score.
- `evaluation-error`: Renderer/Judge/Verifier did not complete; no Candidate quality score.
- `cancelled`: preserve the attempt and do not score it.

For retry or resume, retain the old attempt and create a new attempt. Never replace an assessment or event history in place.

### Propose one controlled change

Require every optimization hypothesis to include:

- Evidence references to Job/Trial/findings.
- Root-cause classification.
- Expected metric effect.
- Exact mutation surface and forbidden surface.
- Rollback condition.

Create a new immutable Candidate version; never edit the baseline in place. Stop when the new digest is unchanged.

### Re-run and gate

Call `harbor_context_preview`; establish a fresh baseline if needed. Run the Candidate under the same comparable Context. Then call `harbor_candidate_compare`.

- `PROMOTE`: recommend external promotion with the complete evidence package.
- `REJECT`: keep the Champion and explain every structured reason code.

Never bypass `INFRASTRUCTURE_EXCEPTION_PRESENT`, `ARTIFACT_SCHEMA_INVALID`, Dataset/Stack/Rubric/Judge mismatch, or non-regression failures.

A `diagnostic` Job must never invoke Gate. Reading the Workbench, generating a Reporter summary, or producing a non-reward Optimization Report also must not promote, deploy, publish, or replace the Champion. Gate remains a separate, explicit comparison action.

## Govern evaluator changes

Read `references/evaluator-upgrade.md` whenever the user asks to improve, replace, align, calibrate, debug, or explain an Evaluator, Rubric, Judge, reward, or meta-evaluation loop.

Use the Workbench Governance view to read component identity, source, Rubric, Judge parameters, Contract, and Context impact. Before any Evaluator/Rubric/Judge edit:

1. Show the current source and proposed diff.
2. State which reward semantics change.
3. Create a new component and Stack version; never overwrite historical identity.
4. Establish a fresh baseline when a reward-affecting digest or Judge identity changes.
5. Run meta-evaluation against independently maintained human GT when aligning the Evaluator itself.

Saving a new identity does not automatically launch an evaluation or Gate.

An Evaluator implementation must use `harbor-dsh-evaluator/v1`. It may declare `kind=script` or `kind=llm-as-judge`, but both kinds accept `evaluation-input/v1` and return `evaluation-result/v1` Criteria using the Descriptor-declared score values. Use `harbor_evaluator_inspect` before proposing a change. After the user approves, use `harbor_evaluator_update` only for an exact `editable_files` path and provide the current digest plus new Evaluator and Stack versions. The tool creates a new versioned bundle; it does not overwrite the old implementation, run meta-evaluation, establish a baseline, or invoke Gate.

## Handle evaluator meta-evaluation

Rotate roles when improving the Evaluator:

- Candidate is the Evaluator/Rubric/Judge version.
- Dataset contains independently maintained human GT.
- Metrics include RCR, bias, variance, calibration, latency, and cost as appropriate.
- The Candidate evaluator must not author its own GT or final promotion decision.

Manage evaluator Candidates and meta-evaluation Jobs with the same Manifest, Context v2, Doctor, evidence, and Gate rules.

## Report each cycle

Return:

- Accepted Evaluation Contract and unresolved assumptions.
- Candidate, Dataset, Stack, Context, Judge, and Policy identities.
- Comparable baseline or fresh-baseline decision.
- Metric deltas, exception counts, Population groups, and artifact validation.
- Dataset coverage, terminal-state counts, valid/invalid score counts, and selected attempt policy.
- Representative Trial evidence and root-cause classes.
- Evidence provenance and any capability unavailable on a legacy Job.
- Controlled change hypothesis and mutation surface.
- Gate decision with exact reason codes.
- External CI/CD action still required.
