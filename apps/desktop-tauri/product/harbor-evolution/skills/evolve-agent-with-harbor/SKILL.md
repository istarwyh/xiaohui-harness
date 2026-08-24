---
name: evolve-agent-with-harbor
description: Architect, initialize, run, diagnose, compare, and safely improve a DeepSeek Harness business Agent with Harbor Trial Lifecycle, Score Validity, Evidence Provenance, Evaluation Stack, Context v2, Architecture Doctor, and explicit Promotion Gate. Use for Harbor setup, Agent self-evolution, vertical-search evaluation loops, running Job inspection, failed Trial diagnosis, Candidate optimization, evaluator governance or meta-evaluation, and promotion decisions.
---

# Evolve Agent With Harbor

Build a reproducible improvement loop around four concepts that users can describe in business language:

- **评测集 (Dataset)** — what should be tested: one Query, a file, a directory of instructions, or an existing Harbor Dataset.
- **生成器 (Generator)** — who produces the answer or artifact: a curl request, a local Agent entry, or an Agent already found in the workspace.
- **评测器（含评测标准） (Evaluator)** — what “good” means and who scores it: an evaluator endpoint, a local evaluator, or a versioned evaluator drafted from natural-language criteria.
- **优化器 (Optimizer)** — who uses badcases and evidence to propose the next controlled change: this Agent by default, Codex/Claude Code, or a local command/Agent.

Keep these four names visible during onboarding and confirmation; they establish the product's concept space. Treat Integration, Renderer, Rubric, Diagnoser, Runner, Reporter, Judge identity, Contract, Policy, Context, and Gate as the compiled evaluation architecture. Explain them only when they affect a decision or the user opens advanced configuration.

Treat Harbor as the experiment boundary. Deployment, CI/CD, and Champion replacement remain external actions requiring separate authority.

## Select the narrowest mode

- **Clarify**: identify the Dataset, Generator, Evaluator/criteria, and Optimizer with the least user effort.
- **Architecture**: inspect role boundaries and run `harbor_evolution_doctor`.
- **Initialize**: read `references/initialization.md`, compile the accepted four-concept card, then call `harbor_evolution_init`.
- **Diagnostic**: investigate failures without making a promotion claim.
- **Promotion**: run a `promotion-eligible` Job and apply the deterministic Gate.
- **Evolve**: baseline → diagnose → one controlled change → regression Job → Gate.
- **Meta-evaluate**: improve an Evaluator/Judge against independently maintained, provenance-bearing GT.
- **Govern**: inspect Evaluator/Rubric/Judge source and identities; preview whether a change requires a fresh baseline.

Do not turn an inspection or diagnostic request into Agent mutation or deployment.

## Start with four clear concepts

Inspect the current workspace before asking questions. Look for Agent entry files, package metadata, curl examples, Dataset instructions, existing Harbor configuration/Jobs, tests, and available Codex or Claude Code commands. Reuse reliable findings and say what was inferred; do not ask the user to transcribe information already present in files.

When no Harbor workspace exists, propose `./harbor-evolution/` under the current session working directory as the managed evaluation workspace. Agent-facing Harbor Tools derive `projectRoot` from the calling session for every invocation and keep imported snapshots and generated evaluation files inside that request-local root. Treat the Plugin's configured `projectRoot` only as the Web Workbench and non-Agent fallback; do not block initialization merely because it differs from the current session working directory.

Ask only for missing parts of the four-concept intake, using the user's language and short examples:

1. **评测集：测什么？** Accept one Query, a file path, a directory containing multiple instructions, or an existing Dataset path.
2. **生成器：谁来回答？** Accept a curl request or a local Agent file/directory. Offer an Agent entry discovered in the workspace instead of asking again.
3. **评测器（评测标准）：怎样算好？** Accept an evaluator curl request, a local evaluator path, or “请你生成”. If no evaluator exists, ask only for natural-language criteria and draft a versioned evaluator plus Rubric for confirmation.
4. **优化器：谁根据结果改进？** Default to the current Agent. If Codex CLI or Claude Code is available, present it as an optional alternative; also accept a local command or Agent path.

One compact message may contain all unresolved concepts, but do not turn it into a form full of architecture terms. Never ask a first-time user to enumerate Evaluation Stack roles, identities, versions, Judge parameters, Contract fields, Policy fields, holdout rules, or CI/CD details.

Interpret common inputs helpfully:

- A single Query becomes a one-task **diagnostic** Dataset. It is useful for checking wiring, but never counts as promotion evidence by itself.
- A file or directory may become a multi-task Dataset after instructions and safe paths are validated.
- For curl input, infer method, endpoint, headers, body shape, and response protocol. Never persist Authorization values or other credentials.
- “请你生成评测器” means the current Agent may author a pinned evaluator implementation; it does not permit ad-hoc, unversioned scoring by the current chat model.
- “你来优化” selects the current Agent as Optimizer; it does not authorize mutation before baseline evidence and an accepted hypothesis exist.

Before creating files, show one confirmation card:

```text
开始前确认
- 工作空间：<path>
- 评测集：<source and task count; diagnostic or regression>
- 生成器：<curl/local Agent/detected Agent>
- 评测器（评测标准）：<implementation or draft criteria>
- 优化器：<current Agent/Codex/Claude Code/local>
- 我将自动补全：版本标识、适配器、产物呈现、诊断、报告和运行配置
- 暂不启用：<holdout / formal promotion Gate / deployment, when unresolved>
```

Offer three next actions in natural language: **开始初始化**, **修改以上内容**, or **查看高级配置**. Call `harbor_evolution_init` only after the user accepts the card. Generate internal ids and initial versions from the workspace/project identity, use `reward`/`maximize` as a visible draft when the criteria imply quality scoring, and do not use the generated Policy for a `promotion-eligible` Job until real business thresholds are accepted.

Ask advanced questions just in time:

- Ask for holdout boundaries and side-effect constraints before they can affect a real run.
- Ask for metric thresholds, non-regression limits, repeat policy, and promotion owner before the first `promotion-eligible` Job.
- Ask for GT identity, provenance, and independence only when calibrating or replacing the Evaluator.
- Ask for deployment/CI authority only after Gate recommends promotion.

Never invent GT labels, business thresholds, credentials, production side-effect permission, or deployment authority. A Generator and Evaluator may share a provider only after disclosing the coupling; do not treat that as independent GT.

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

Read `references/initialization.md` when required files are missing. Translate the accepted four-concept card into strict internal identities and call `harbor_evolution_init`; do not send the user back a second architecture questionnaire. It preserves existing files and creates explicit placeholders that still require business implementation.

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
5. Run meta-evaluation against independently maintained GT when aligning the Evaluator itself.

Saving a new identity does not automatically launch an evaluation or Gate.

An Evaluator implementation must use `harbor-dsh-evaluator/v1`. It may declare `kind=script` or `kind=llm-as-judge`, but both kinds accept `evaluation-input/v1` and return `evaluation-result/v1`. Every Descriptor-declared Criterion must return its declared score plus a non-empty `reason` string and a non-empty `recommendation` string. Missing explanations or recommendations invalidate the evaluator result; Reporter must not invent them. Use `harbor_evaluator_inspect` before proposing a change. After the user approves, use `harbor_evaluator_update` only for an exact `editable_files` path and provide the current digest plus new Evaluator and Stack versions. The tool creates a new versioned bundle; it does not overwrite the old implementation, run meta-evaluation, establish a baseline, or invoke Gate.

## Handle evaluator meta-evaluation

Rotate roles when improving the Evaluator:

- Candidate is the Evaluator/Rubric/Judge version.
- Dataset contains fixed artifacts plus independently maintained GT with explicit source kind and provenance.
- Metrics include RCR, bias, variance, calibration, latency, and cost as appropriate.
- The Candidate evaluator must not author its own GT or final promotion decision.

GT may be human, programmatic, consensus-based, produced by an independently pinned model, or imported from an external standard. Independence and provenance matter more than the author type. The Candidate evaluator must never see labels before producing its observation.

When GT is missing, clarify its id/version, source kind, owner, provenance, Criteria, case selection, and adjudication process. Then call `harbor_ground_truth_init`; it creates a non-overwriting draft and never invents cases or labels. After cases are populated, collect repeated `evaluator-observations/v1` and call `harbor_evaluator_meta_evaluate`. Report ESF, SCE, RCR, coverage, disagreement slices, latency, and cost as applicable.

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
