# Evaluator Upgrade Workflow

Load this reference when the user wants to improve score reliability or change Evaluator, Rubric, Judge, reward semantics, or meta-evaluation.

## Clarify the evaluator objective

Inspect `harbor_eval_result view=governance` and representative Trial evidence first. Resolve:

1. Which false positives, false negatives, disagreements, or calibration failures matter.
2. Who owns the independently maintained GT, its source kind and provenance, and how adjudication works.
3. Which meta-metrics define improvement: RCR, precision/recall, bias, variance, calibration, latency, or cost.
4. The allowed Evaluator/Rubric/Judge mutation surface and budget.
5. The approval owner for adopting new score semantics.

Do not use the Candidate Agent to author its own GT. Do not infer GT from the current Evaluator output.

## Create a new immutable evaluator identity

Show the current identity, source, proposed diff, and expected semantic impact. Create new files and increment component plus Evaluation Stack versions. Never edit a historical Evaluator, Rubric, Judge identity, or old Job artifact in place.

Use the `harbor-dsh-evaluator/v1` Descriptor as the implementation boundary:

- `kind=script` for deterministic code, rules, or local models.
- `kind=llm-as-judge` for a model-backed judge; keep credentials out of source and identity artifacts.
- Both kinds consume `evaluation-input/v1` and return `evaluation-result/v1` with Descriptor-declared Criterion ids and score values.
- Every Criterion also requires non-empty `reason` and `recommendation` strings. Missing fields invalidate the evaluator result; Reporter never fabricates them.
- `editable_files` is the exact source allowlist used by the Workbench and `harbor_evaluator_update`.

Call `harbor_evaluator_inspect` to capture the active digest. After explicit approval, `harbor_evaluator_update` requires the expected file digest plus new Evaluator and Stack versions, copies the whole bundle to a new version directory, and switches the active Stack. It never launches evaluation or Gate.

Treat changes to any of these as reward-semantic changes requiring a new Context and fresh Agent baseline:

- Evaluator source or digest.
- Rubric source or digest.
- Judge provider, model, version, or parameters.
- Evaluation Contract metric meaning or hard requirements.

## Meta-evaluate before adopting

Rotate roles:

- Candidate: the new Evaluator/Rubric/Judge version.
- Dataset: independently maintained examples with provenance-bearing GT and disagreement metadata.
- Evaluator: deterministic comparison between evaluator decisions and GT.
- Reporter: RCR and accepted diagnostic slices.
- Gate: explicit human-approved adoption decision.

Use the same GT set, repeat policy, and measurement procedure for old and new evaluator Candidates. Report coverage, invalid measurements, aggregate metrics, disagreement slices, latency, cost, and representative errors. Do not select only favorable runs.

GT is not synonymous with human labeling. It may be human, programmatic, consensus-based, produced by a separately pinned model, or imported from an external standard. Require explicit provenance and independence from the Candidate evaluator in every case. Use `harbor_ground_truth_init` to create the versioned draft and `harbor_evaluator_meta_evaluate` to calculate ESF, SCE, and RCR from repeated observations.

## Re-baseline Agent progress

After the evaluator Candidate passes its explicit Gate:

1. Update Evaluation Stack identity.
2. Preview Context v2 and confirm old Agent Jobs are no longer comparable.
3. Run the current Champion Agent as a fresh baseline under the new evaluator.
4. Compare later Agent Candidates only against Jobs sharing the new Context digest.

Adopting an evaluator does not mutate, promote, deploy, or publish an Agent automatically.
