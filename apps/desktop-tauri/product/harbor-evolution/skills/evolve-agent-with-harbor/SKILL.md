---
name: evolve-agent-with-harbor
description: Architect, initialize, run, diagnose, compare, and safely improve a DeepSeek Harness business Agent or Evaluator with Harbor. Use for low-friction Harbor setup, evaluating recent completed DSH Sessions when no Dataset is supplied, Agent self-evolution, vertical-search evaluation loops, running Job inspection, failed Trial diagnosis, Candidate optimization, evaluator governance, turning reviewed reports and natural-language scoring feedback into evaluator meta-evaluation data, or explicit promotion decisions.
---

# Evolve Agent With Harbor

Build a maintainable, evidence-bearing improvement loop around four concepts that users can describe in business language. The DSH and Candidate ACP runtime follows the latest published release by default; record that policy honestly and do not block a Job on an older pinned runtime:

- **评测集 (Dataset)** — what should be tested: one Query, a file, a directory of instructions, or an existing Harbor Dataset.
- **生成器 (Generator)** — who produces the answer or artifact: a curl request, a local Agent entry, or an Agent already found in the workspace.
- **评测器（含评测标准） (Evaluator)** — what “good” means and who scores it: an evaluator endpoint, a local evaluator, or a versioned evaluator drafted from natural-language criteria.
- **优化器 (Optimizer)** — who uses badcases and evidence to propose the next controlled change: this Agent by default, Codex/Claude Code, or a local command/Agent.

Keep these four names visible during onboarding and confirmation; they establish the product's concept space. Treat Integration, Renderer, Rubric, Diagnoser, Runner, Reporter, Judge identity, Contract, Policy, Context, and Gate as the compiled evaluation architecture. Explain them only when they affect a decision or the user opens advanced configuration.

Treat Harbor as the experiment boundary. Deployment, CI/CD, and Champion replacement remain external actions requiring separate authority.

## Keep the Generator model explicit

For a DSH/Cordis Generator, offer “使用当前 Harbor Agent 模型” as the default model choice. Explain that this creates a **model binding**, not a live pointer:

> 创建 Candidate 时会固定本次 `provider / model / reasoning`；之后切换聊天模型不会改写已经建立的 Candidate。

After the user accepts, call `harbor_model_binding` and write its `candidate_model_binding` output verbatim to `model-binding.json` before `harbor_candidate_snapshot`. Show the resolved provider/model in the confirmation card. The file contains identity only and becomes part of the Candidate digest.

The runtime must remain `dsh-host-broker` / `dsh-host-model-gateway/v1`: the Candidate receives a random, short-lived Job capability, never GPT Auth, Codex OAuth, an API key, or another Host credential. Do not add a provider credential, auth file path, or secret value to the Candidate, Dataset, Stack, Job, prompt, report, or tool arguments. A pinned Candidate that needs a different model must become a new Candidate version; do not override its binding in place.

## Select the narrowest mode

- **Clarify**: identify the Dataset, Generator, Evaluator/criteria, and Optimizer with the least user effort.
- **Architecture**: inspect role boundaries and run `harbor_evolution_doctor`.
- **Initialize**: read `references/initialization.md`, compile the accepted four-concept card, then call `harbor_evolution_init`.
- **Diagnostic**: investigate failures without making a promotion claim.
- **Historical generation diagnostic**: when no Dataset was supplied, preview recent completed DSH Sessions and, only after confirmation, evaluate the immutable records without re-executing a Candidate.
- **Quick diagnostic**: after confirmation, call `harbor_quick_diagnostic_init` for one Query plus a Rubric draft. It generates a Harbor 1.4 wiring project that reuses the current DSH model and is permanently marked non-promotable.
- **Promotion**: run a `promotion-eligible` Job and apply the deterministic Gate.
- **Evolve**: baseline → diagnose → one controlled change → regression Job → Gate.
- **Meta-evaluate**: improve an Evaluator/Judge against independently maintained, provenance-bearing GT.
- **Govern**: inspect Evaluator/Rubric/Judge source and identities; preview whether a change requires a fresh baseline.

Do not turn an inspection or diagnostic request into Agent mutation or deployment.

## Default to recent Sessions only when Dataset is absent

Preserve explicit user input. If the user supplies any Dataset, Query, instruction file/directory, Dataset path, or Dataset-bearing curl workflow, use the normal four-concept flow below. Never replace or augment an explicit Dataset with Session history unless the user separately asks for that change.

Only when no Dataset was supplied and `harbor_session_diagnostic_preview` is available:

1. Call `harbor_session_diagnostic_preview` with `limit=10`. This is a read-only Preview, not a Job. If the user selected a different Judge, pass its provider/model/reasoning options here so that identity is part of the confirmation token.
2. Present the returned safe Session metadata, exact-cwd scope, last-activity order, excluded counts, warnings, estimated Judge requests, token expiry, and confirmation text. Do not expose or reconstruct raw Session ids, transcripts, tool payloads, or credentials.
3. Explain the role mapping plainly: the DSH Agent that produced each Session remains the **Generator**; the completed Session is immutable Generation Record evidence; one Historical Generation Evaluation Job contains up to 10 Trials; one selected Session becomes one Trial.
4. Ask for explicit confirmation. Do not call the run tool merely because Preview succeeded. If the sample changed or the token expired, preview again instead of widening scope.
5. After confirmation, call `harbor_session_diagnostic_run` with the returned `selectionToken` (and only an optional `jobName`). Evaluator/Judge overrides belong to Preview and are rejected at Run so the confirmed identity cannot change. The tool synchronously materializes the private Batch into its matching Dataset and immutable Historical Evaluation Stack before starting the Job. Do not pass `stackPath`: the MVP rejects custom Historical Stacks so the executed Evaluator cannot drift from the declared Stack. Do not call `harbor_candidate_snapshot`, `harbor_model_binding`, `harbor_context_preview`, or `harbor_eval_run` for this branch.

Render this compact confirmation card before running:

```text
会话历史评测确认
- 范围：当前工作目录，按最后活动时间选取最近 <N>/10 条已完成会话
- 生成器：产生这些会话的 DSH Agent（本次不会重新执行）
- 评测对象：<N> 条已有 Generation Records；1 条会话 = 1 Trial
- 评测器：<evaluation.evaluator.id>@<version> · Judge <evaluation.judge.provider>/<model>
- 评测耦合：<evaluation.coupling；同模型或 Generator 模型未知时明确仅用于诊断，不声称独立>
- 成本上界：<estimatedJudgeRequests> 次 Judge 请求
- 用途：诊断、群体分析与生成器问题定位
- 本地保留：`.harbor/private` 和 `jobs` 会保存脱敏后的真实业务会话证据，默认不会自动删除
- VCS 风险：private 根不存在规则时会创建 ignore-all `.gitignore`，但不会覆盖已有规则；`jobs` 的忽略、上传与保留策略仍由项目负责
- 不会执行：Candidate 生成、本 Historical Job 内的评测器元评测、Promotion Gate 或部署
```

Treat the resulting `historical-generation-evaluation` Job as `diagnostic` and `observe-existing`. `completed-unscored` is a normal abstention when evidence is insufficient; report scored/unscored Trial and Criterion coverage separately, and never convert abstention into business score `0`.

Population Analysis and Generator Diagnosis summarize the observed records and Generator population. They are not Evaluator Meta-Evaluation. The existing independent-GT flow (`harbor_ground_truth_init` plus repeated evaluator observations and `harbor_evaluator_meta_evaluate`) remains available as a separate governance action, but this Historical Job never invokes or inherits it automatically. For the Historical Job report `evaluator_meta_evaluation.status=not-run`, say that its Evaluator reliability remains unvalidated, and never claim ESF/SCE/RCR evidence from Session scores. A future dedicated `evaluator-meta-evaluation` Job may package that existing flow into a Job lifecycle; do not describe the underlying meta-evaluation capability as absent.

Historical Generation Jobs are never comparable Candidate baselines or Promotion Gate inputs. Report Gate as `N/A`; if comparison is requested, explain `UNSUPPORTED_JOB_KIND_FOR_PROMOTION` and first convert reviewed badcases into a fixed regression Dataset.

If the Session Query capability or Preview tool is unavailable, state that limitation and continue with the ordinary four-concept intake. Do not invent a filesystem transcript scan as a fallback.

State current MVP limits instead of suggesting unsupported controls: selection is exact-cwd, reads at most the configured `sessionMaxReads` candidates (100 by default), accepts an optional ISO-8601 `createdAfter` lower bound, and exposes no cursor. On `SESSION_SELECTION_TOO_EXPENSIVE`, preview again with a narrower `createdAfter`, use an explicit Query/Dataset, or ask an administrator to review the read limit. A token binds Feedback availability, failure state, and content digest without retaining raw Feedback; if any of them changes, Run fails before writing the Batch and requires a new Preview. Do not claim that a real Docker/Harbor/Workbench journey passed from unit tests, generated files, or a zero process exit code alone.

## Start with four clear concepts

Inspect the current workspace before asking questions. Look for Agent entry files, package metadata, curl examples, Dataset instructions, existing Harbor configuration/Jobs, tests, and available Codex or Claude Code commands. Reuse reliable findings and say what was inferred; do not ask the user to transcribe information already present in files.

When no Harbor workspace exists, propose `./harbor-evolution/` under the current session working directory as the managed evaluation workspace. Agent-facing Harbor Tools derive `projectRoot` from the calling session for every invocation and keep imported snapshots and generated evaluation files inside that request-local root. Every Harbor Tool call also activates that Session root for the Web Workbench; the Plugin's configured `projectRoot` is only the startup/manual fallback. Do not block initialization merely because the fallback differs from the current session working directory.

Ask only for missing parts of the four-concept intake, using the user's language and short examples:

1. **评测集：测什么？** Accept one Query, a file path, a directory containing multiple instructions, or an existing Dataset path.
2. **生成器：谁来回答？** Accept a curl request or a local Agent file/directory. For a DSH/Cordis Agent, offer “使用当前 Harbor Agent 模型” alongside a discovered entry; resolve it with `harbor_model_binding` only after the user agrees.
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

When model binding is selected, render the Generator row as `<local Agent> · <provider>/<model>（已固定）`. Never show credential locations or values.

Offer three next actions in natural language: **开始初始化**, **修改以上内容**, or **查看高级配置**. Call `harbor_evolution_init` only after the user accepts the card. Generate internal ids and initial versions from the workspace/project identity, use `reward`/`maximize` as a visible draft when the criteria imply quality scoring, and do not use the generated Policy for a `promotion-eligible` Job until real business thresholds are accepted.

For a single-Query wiring check, call `harbor_quick_diagnostic_init` after confirmation. State before and after the call that its score proves only Candidate → Harbor → verifier connectivity: the supplied Rubric is saved as a draft but is not executed. Never use its Job as a Baseline or pass it to Gate.

Ask advanced questions just in time:

- Ask for holdout boundaries and side-effect constraints before they can affect a real run.
- Ask for metric thresholds, non-regression limits, repeat policy, and promotion owner before the first `promotion-eligible` Job.
- Ask for GT identity, provenance, and independence only when calibrating or replacing the Evaluator.
- Ask for deployment/CI authority only after Gate recommends promotion.

Never invent GT labels, business thresholds, credentials, production side-effect permission, or deployment authority. A Generator and Evaluator may share a provider only after disclosing the coupling; do not treat that as independent GT.

## Enforce the strict architecture

Require these before every Candidate execution Job:

- `candidate-manifest.json` verified against the Candidate files.
- `dataset-manifest.json` with unique task ids, non-empty instructions, safe paths, a matching source digest, and the same Task population that Harbor resolves at runtime. A local Dataset contains immediate Task child directories; each Task uses `schema_version = "1.4"`, `[task].name = "org/name"`, `instruction.md`, `environment/`, and `tests/test.sh`.
- `.harbor/evaluation-stack.yml` with all eight roles, Judge identity, and Evaluation Contract.
- Evaluation Context v2 preview.

Require `input_integrity`, `agent_completed`, `integration_valid`, `renderer_valid`, `judge_completed`, and `artifact_schema_valid` in the Trial validity contract. Specify which failures are hard requirements. Never infer that a numeric raw verifier reward is a valid Candidate quality score.

Before a formal Candidate execution Job, call in order:

1. `harbor_candidate_snapshot`
2. `harbor_dataset_validate`
3. `harbor_evolution_doctor`
4. `harbor_context_preview`

Do not launch a `promotion-eligible` Job when Doctor reports an error, no comparable baseline exists, or `fresh_baseline_required` is true. A Candidate-execution diagnostic Job may investigate architecture warnings, but still requires a valid Candidate, Dataset Manifest, Evaluation Stack, and Context v2. The observe-existing Session branch instead uses its frozen Historical Generation Batch, Historical Evaluation Context, and non-promotion Stack.

Keep Runner orchestration-only. Treat these as architecture errors:

- Runner combines HTTP integration, rubric, and Judge logic.
- Runner makes a promotion/Champion decision.

## Initialize without overwriting

Read `references/initialization.md` when required files are missing. Translate the accepted four-concept card into strict internal identities and call `harbor_evolution_init`; do not send the user back a second architecture questionnaire. It preserves existing files and creates explicit placeholders that still require business implementation.

If `.harbor/evaluation-stack.yml` exists with another `stack_id`, do not report initialization success. Explain `STACK_ALREADY_EXISTS_DIFFERENT_ID` and choose an accepted `workspaceSubdir` so independent Harbor projects can coexist. Never overwrite or silently preserve a different Stack identity.

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
- Harbor or Adapter integration identity. DSH and Candidate ACP themselves follow `latest`; do not reject a Job for an older pinned rc. If latest-runtime drift plausibly changes behavior, recommend a fresh baseline on the current latest runtime instead of restoring and maintaining the old runtime.

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
- `completed-unscored`: a Historical Generation Trial completed but the Evaluator abstained for insufficient evidence; preserve it in coverage and do not count it as a quality failure or score `0`.
- `cancelled`: preserve the attempt and do not score it.

For retry or resume, retain the old attempt and create a new attempt. Never replace an assessment or event history in place.

### Synthesize one Dataset-level recommendation

When the user opens an evaluation report or asks what to improve, do not stop at aggregate metrics and do not merely repeat per-Trial recommendations. The current Agent acting as Optimizer must synthesize one concrete **评测集整体优化建议** from the complete Dataset evidence. This synthesis is non-reward-affecting Optimizer output, not a new Evaluator score and not a recommendation invented on behalf of the Evaluator.

1. Inspect all Trial assessments, including every server-side page. Never infer a Dataset conclusion from only the first page, selected badcases, or the lowest score.
2. Confirm terminal-state and valid-score coverage first. Keep infrastructure and evaluation errors outside Candidate-quality patterns. If coverage is insufficient, say that a trustworthy business optimization recommendation cannot yet be made and recommend repairing the owning evaluation layer.
3. Group valid results by Criterion, recurring reason/recommendation, Query or population slice. Report the affected count as `N / valid Trials`, distinguish repeated patterns from isolated cases, and identify representative Trial ids or instructions.
4. Read the corresponding generated artifacts before assigning ownership. Choose the highest-leverage repeated weakness that is Candidate-owned; do not optimize the Candidate around a Dataset, Evaluator, Rubric, Judge, Renderer, or infrastructure defect.
5. Produce one prioritized recommendation with this user-facing shape:

```text
评测集整体结论：<what is already reliable and the dominant weakness>
关键证据：<Criterion and score distribution; N/M affected; representative Trials>
优先优化建议：<one specific Candidate behavior or implementation change>
预期效果：<which metric/pattern should improve and what must not regress>
验证方式：<same Dataset/Context regression Job; protected metrics and rollback condition>
```

Base the recommendation on the Evaluator's recorded scores, reasons, recommendations, and the actual Candidate artifacts. Do not invent missing reasons, average incompatible Criteria, or present correlation as a proven root cause. If the evidence supports several changes, rank them but recommend only one controlled next experiment. If the user accepts it, translate it into an `optimization-report/v2`-compatible hypothesis with evidence refs, mutation and forbidden surfaces, guardrails, rollback condition, and a comparable next Job before changing the Candidate.

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

A `diagnostic` Job must never invoke Gate. A Historical Generation Job always displays Gate as `N/A` and must not be passed to `harbor_candidate_compare`. Reading the Workbench, generating a Reporter summary, or producing a non-reward Optimization Report also must not promote, deploy, publish, or replace the Champion. Gate remains a separate, explicit Candidate comparison action.

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

The Task verifier must write `/logs/verifier/evaluation-result.json`; `reward.json` alone is not a valid `harbor-dsh-evaluator/v1` result. Summary and Trial views must use the same validity decision.

## Explain failures with the next action

Use the structured diagnostic tail returned by `harbor_eval_run`; never answer with only an exit code. Redact credentials and map common signatures:

- `AgentSetupTimeoutError` → use an image with Python, curl, Node.js, npm, `stdbuf`, ACP, and DSH dependencies preinstalled.
- `evaluation-result.json is missing` → fix the Task verifier to emit `evaluation-result/v1` with reasons and recommendations.
- `Either datasets or tasks must be provided` / `HARBOR_RUNTIME_NO_TASKS` → repair the Dataset's immediate Harbor 1.4 Task structure and re-snapshot it.
- `docker-credential-*` → repair the configured helper or use a verified local base image.

Rerun `harbor_dataset_validate` and `harbor_evolution_doctor` before retrying. Preserve the failed Job as evidence; do not mutate it in place.

## Handle evaluator meta-evaluation

Read `references/evaluator-upgrade.md` before handling reviewed reports, expert comments, scoring notes, evaluator calibration, or meta-evaluation. Keep protocol names out of the initial user interaction.

Start from evidence the user already has. Ask only:

> 请提供一些已经被评价过的报告，以及对应的评分、问题或修改建议。你可以直接粘贴文本，也可以提供文件或目录路径。我会整理成评测器元评测集，并只请你确认有歧义的评分。

Accept one report, several pasted report/review pairs, or a directory. Do not initially ask the user for GT JSON, Criterion ids, provenance fields, repeat policy, Evaluator identity, or meta-metric thresholds. Inspect the active Rubric and infer stable internal ids and versions after understanding the material.

For every report/review pair:

1. Preserve the original report and review as source evidence. Never replace them with only the normalized JSON.
2. Extract Criterion, score, reason, any reviewer-provided recommendation, and the exact review excerpt supporting the extraction.
3. Mark each extracted decision internally as `explicit`, `inferred`, or `unresolved`.
4. Map a natural-language judgment to the active score scale only when the Rubric makes the mapping defensible. Treat the mapped value as a draft, not confirmed GT.
5. Show one compact table with report, Criterion, proposed score, reason, recommendation, and status. Ask only targeted questions for `inferred` or `unresolved` rows.
6. Create formal GT only after the user confirms the draft. Never silently fill a missing score, reason, source, or independence claim. A missing reviewer recommendation may remain empty and must not be attributed to the reviewer.

Use plain language in the confirmation. Say “标准评分” instead of `ground-truth/v1`, “评测器重复评分” instead of `evaluator-observations/v1`, and “评测器可靠性报告” instead of `meta-evaluation-report/v1`. Protocol names may appear later in an audit or advanced view.

Rotate roles when improving the Evaluator:

- Candidate is the Evaluator/Rubric/Judge version.
- Dataset contains fixed artifacts plus independently maintained GT with explicit source kind and provenance.
- Metrics include RCR, bias, variance, calibration, latency, and cost as appropriate.
- The Candidate evaluator must not author its own GT or final promotion decision.

GT may be human, programmatic, consensus-based, produced by an independently pinned model, or imported from an external standard. Independence and provenance matter more than the author type. The Candidate evaluator must never see labels before producing its observation.

After confirmation, infer a readable GT id/version, source kind, provenance, Criteria, case ids, and initial weights from the accepted material. Show any consequential inference. Call `harbor_ground_truth_init`; it creates a non-overwriting draft and never invents cases or labels. Populate the draft from confirmed rows using ordinary safe file operations, keeping artifact references inside the request-local project root.

Treat one reviewed report as a diagnostic calibration example, not evidence that an Evaluator is generally reliable. With enough cases, propose a tuning/holdout split without burdening the user with the terminology: explain that one group helps improve the Evaluator and an untouched group checks whether the improvement generalizes. Never expose holdout labels to the Candidate evaluator or use its own prior output as GT.

After cases are populated, run the same Evaluator repeatedly on the fixed reports, collect `evaluator-observations/v1`, and call `harbor_evaluator_meta_evaluate`. The user should not have to hand-author either JSON file. Report ESF, SCE, RCR, coverage, disagreement slices, latency, and cost as applicable, then translate them back into direct conclusions: missed problems, false alarms, unstable judgments, and the smallest justified Evaluator/Rubric change.

Manage Evaluator Candidates and the existing independent-GT meta-evaluation artifacts with immutable identities, provenance, comparable observations, and an explicit human adoption decision. A dedicated `evaluator-meta-evaluation` Harbor Job lifecycle is future work; do not claim that `harbor_evaluator_meta_evaluate` created such a Job.

## Report each cycle

Return:

- Accepted Evaluation Contract and unresolved assumptions.
- Candidate, Dataset, Stack, Context, Judge, and Policy identities.
- Comparable baseline or fresh-baseline decision.
- Metric deltas, exception counts, Population groups, and artifact validation.
- Dataset coverage, terminal-state counts, valid/invalid score counts, and selected attempt policy.
- Representative Trial evidence and root-cause classes.
- One Dataset-level overall conclusion and one prioritized, evidence-linked optimization recommendation; explicitly state when score validity or coverage is insufficient for one.
- Evidence provenance and any capability unavailable on a legacy Job.
- Controlled change hypothesis and mutation surface.
- Gate decision with exact reason codes for Candidate comparison Jobs, or explicit `N/A` for Historical Generation Jobs.
- External CI/CD action still required.
