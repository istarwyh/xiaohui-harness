from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any

from harbor_dsh_evolution.identity import canonical_digest, resolve_inside

GROUND_TRUTH_PROTOCOL = "ground-truth/v1"
OBSERVATIONS_PROTOCOL = "evaluator-observations/v1"
META_REPORT_PROTOCOL = "meta-evaluation-report/v1"
SOURCE_KINDS = {"human", "programmatic", "consensus", "model", "external"}
TERNARY_VALUES = {0, 0.5, 1}


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        raise ValueError(f"{path.name} is invalid JSON: {error.msg}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} must contain a JSON object")
    return value


def _identity(value: Any, label: str) -> str:
    result = str(value or "").strip()
    if not result:
        raise ValueError(f"{label} is required")
    return result


def _resolve_output(project_root: Path, path: Path, label: str) -> Path:
    candidate = path.expanduser()
    if not candidate.is_absolute():
        candidate = project_root / candidate
    candidate = candidate.resolve(strict=False)
    if candidate == project_root or project_root not in candidate.parents:
        raise ValueError(f"{label} must stay inside project root")
    return candidate


def _criterion_ids(criteria: Any, label: str) -> list[str]:
    if not isinstance(criteria, list) or not criteria:
        raise ValueError(f"{label} requires at least one criterion")
    result = [_identity(item.get("id") if isinstance(item, dict) else None, f"{label} criterion id") for item in criteria]
    if len(result) != len(set(result)):
        raise ValueError(f"{label} criterion ids must be unique")
    return result


def initialize_ground_truth(
    *,
    project_root: Path,
    output_path: Path,
    ground_truth_id: str,
    version: str,
    source_kind: str,
    source_description: str,
    provenance: str,
    criteria: list[str],
) -> dict[str, Any]:
    project_root = project_root.expanduser().resolve(strict=True)
    output_path = _resolve_output(project_root, output_path, "ground truth")
    if output_path.exists():
        raise ValueError("Ground Truth already exists; create a new version instead of overwriting it")
    if source_kind not in SOURCE_KINDS:
        raise ValueError("source_kind must be human, programmatic, consensus, model, or external")
    normalized_criteria = list(dict.fromkeys(_identity(item, "criterion") for item in criteria))
    if not normalized_criteria:
        raise ValueError("At least one Ground Truth criterion is required")
    value = {
        "schema_version": 1,
        "protocol": GROUND_TRUTH_PROTOCOL,
        "ground_truth_id": _identity(ground_truth_id, "ground_truth_id"),
        "version": _identity(version, "version"),
        "source": {
            "kind": source_kind,
            "description": _identity(source_description, "source_description"),
            "provenance": _identity(provenance, "provenance"),
            "independent_of_candidate": True,
        },
        "criteria": [{"id": identity, "label": identity} for identity in normalized_criteria],
        "cases": [],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    return {
        "schema_version": 1,
        "created": output_path.relative_to(project_root).as_posix(),
        "ready": False,
        "next_actions": [
            "Add independently sourced cases and criterion labels",
            "Record artifact_ref, ternary score, positive weight, and reason for every criterion",
            "Collect repeated evaluator observations without exposing Ground Truth to the Candidate evaluator",
        ],
        "ground_truth": value,
    }


def validate_ground_truth(value: dict[str, Any]) -> dict[str, Any]:
    if value.get("schema_version") != 1 or value.get("protocol") != GROUND_TRUTH_PROTOCOL:
        raise ValueError("Ground Truth must use ground-truth/v1")
    _identity(value.get("ground_truth_id"), "ground_truth_id")
    _identity(value.get("version"), "version")
    source = value.get("source")
    if not isinstance(source, dict) or source.get("kind") not in SOURCE_KINDS:
        raise ValueError("Ground Truth requires a supported source kind")
    _identity(source.get("description"), "Ground Truth source description")
    _identity(source.get("provenance"), "Ground Truth provenance")
    if source.get("independent_of_candidate") is not True:
        raise ValueError("Ground Truth must be independent of the Candidate evaluator")
    criterion_ids = _criterion_ids(value.get("criteria"), "Ground Truth")
    cases = value.get("cases")
    if not isinstance(cases, list):
        raise ValueError("Ground Truth cases must be an array")
    seen_cases: set[str] = set()
    for case in cases:
        if not isinstance(case, dict):
            raise ValueError("Ground Truth cases must be objects")
        case_id = _identity(case.get("id"), "Ground Truth case id")
        if case_id in seen_cases:
            raise ValueError("Ground Truth case ids must be unique")
        seen_cases.add(case_id)
        _identity(case.get("artifact_ref"), f"Ground Truth case {case_id} artifact_ref")
        labels = case.get("criteria")
        received = _criterion_ids(labels, f"Ground Truth case {case_id}")
        if set(received) != set(criterion_ids):
            raise ValueError(f"Ground Truth case {case_id} criteria do not match the contract")
        for label in labels:
            if label.get("score") not in TERNARY_VALUES:
                raise ValueError(f"Ground Truth case {case_id} scores must be 0, 0.5, or 1")
            if not isinstance(label.get("weight"), int | float) or isinstance(label.get("weight"), bool) or label["weight"] <= 0:
                raise ValueError(f"Ground Truth case {case_id} weights must be positive numbers")
            _identity(label.get("reason"), f"Ground Truth case {case_id} reason")
    return {
        "valid": True,
        "ready": bool(cases),
        "case_count": len(cases),
        "criterion_count": len(criterion_ids),
        "badcase_count": sum(bool(case.get("badcase")) for case in cases),
        "digest": canonical_digest(value, namespace="harbor-dsh-ground-truth-v1"),
    }


def load_ground_truth(path: Path, *, project_root: Path | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    if project_root is not None:
        path = resolve_inside(project_root.expanduser().resolve(strict=True), path, label="ground truth")
    value = _read_json(path)
    return value, validate_ground_truth(value)


def _observations(value: dict[str, Any], ground_truth: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if value.get("schema_version") != 1 or value.get("protocol") != OBSERVATIONS_PROTOCOL:
        raise ValueError("Evaluator observations must use evaluator-observations/v1")
    evaluator = value.get("evaluator")
    if not isinstance(evaluator, dict):
        raise ValueError("Evaluator observations require evaluator identity")
    _identity(evaluator.get("id"), "evaluator id")
    _identity(evaluator.get("version"), "evaluator version")
    repeat_policy = value.get("repeat_policy")
    repeats = repeat_policy.get("repeats") if isinstance(repeat_policy, dict) else None
    if not isinstance(repeats, int) or isinstance(repeats, bool) or repeats < 1:
        raise ValueError("Evaluator observations repeat_policy.repeats must be a positive integer")
    gt_cases = {str(case["id"]): case for case in ground_truth.get("cases") or []}
    criterion_ids = {str(item["id"]) for item in ground_truth.get("criteria") or []}
    observations = value.get("observations")
    if not isinstance(observations, list) or not observations:
        raise ValueError("Evaluator observations require at least one observation")
    seen: set[tuple[str, int]] = set()
    normalized: list[dict[str, Any]] = []
    for observation in observations:
        if not isinstance(observation, dict):
            raise ValueError("Evaluator observations must be objects")
        case_id = _identity(observation.get("case_id"), "observation case_id")
        repeat = observation.get("repeat")
        if case_id not in gt_cases:
            raise ValueError(f"Unknown Ground Truth case: {case_id}")
        if not isinstance(repeat, int) or isinstance(repeat, bool) or repeat < 1 or repeat > repeats:
            raise ValueError(f"Observation {case_id} has an invalid repeat index")
        if (case_id, repeat) in seen:
            raise ValueError(f"Observation {case_id} repeat {repeat} is duplicated")
        seen.add((case_id, repeat))
        labels = observation.get("criteria")
        received = _criterion_ids(labels, f"Observation {case_id}/{repeat}")
        if set(received) != criterion_ids:
            raise ValueError(f"Observation {case_id}/{repeat} criteria do not match Ground Truth")
        scores = {}
        for label in labels:
            if label.get("score") not in TERNARY_VALUES:
                raise ValueError(f"Observation {case_id}/{repeat} scores must be 0, 0.5, or 1")
            scores[str(label["id"])] = float(label["score"])
        normalized.append({"case_id": case_id, "repeat": repeat, "scores": scores})
    return normalized, evaluator


def _f_beta(recall: float, pass_rate: float, beta: float = 2) -> float:
    denominator = beta * beta * pass_rate + recall
    return 0.0 if denominator == 0 else (1 + beta * beta) * recall * pass_rate / denominator


def meta_evaluate(ground_truth: dict[str, Any], observations_value: dict[str, Any]) -> dict[str, Any]:
    validation = validate_ground_truth(ground_truth)
    if not validation["ready"]:
        raise ValueError("Ground Truth has no cases")
    observations, evaluator = _observations(observations_value, ground_truth)
    gt_cases = {
        str(case["id"]): {str(item["id"]): item for item in case["criteria"]}
        for case in ground_truth["cases"]
    }
    penalty_total = penalty_hit = normal_total = normal_hit = 0.0
    absolute_errors: list[float] = []
    by_group: dict[tuple[str, str], list[float]] = defaultdict(list)
    disagreements: list[dict[str, Any]] = []
    by_criterion: dict[str, list[float]] = defaultdict(list)
    for observation in observations:
        case_id = observation["case_id"]
        for criterion_id, observed_score in observation["scores"].items():
            expected = gt_cases[case_id][criterion_id]
            expected_score = float(expected["score"])
            weight = float(expected["weight"])
            if expected_score < 1:
                penalty_total += weight
                if observed_score < 1:
                    penalty_hit += weight
            else:
                normal_total += weight
                if observed_score == 1:
                    normal_hit += weight
            error = abs(observed_score - expected_score)
            absolute_errors.append(error)
            by_criterion[criterion_id].append(error)
            by_group[(case_id, criterion_id)].append(observed_score)
            if error:
                disagreements.append({
                    "case_id": case_id,
                    "repeat": observation["repeat"],
                    "criterion_id": criterion_id,
                    "ground_truth": expected_score,
                    "observed": observed_score,
                    "absolute_error": error,
                })
    penalty_recall = penalty_hit / penalty_total if penalty_total else 1.0
    normal_pass_rate = normal_hit / normal_total if normal_total else 1.0
    repeated_groups = [scores for scores in by_group.values() if len(scores) >= 2]
    stable_groups = sum(len(set(scores)) == 1 for scores in repeated_groups)
    expected_observations = len(ground_truth["cases"]) * int(observations_value["repeat_policy"]["repeats"])
    report = {
        "schema_version": 1,
        "protocol": META_REPORT_PROTOCOL,
        "ground_truth": {
            "id": ground_truth["ground_truth_id"],
            "version": ground_truth["version"],
            "digest": validation["digest"],
            "source": ground_truth["source"],
            "case_count": validation["case_count"],
            "badcase_count": validation["badcase_count"],
        },
        "evaluator": evaluator,
        "coverage": {
            "expected_observations": expected_observations,
            "observed": len(observations),
            "rate": round(len(observations) / expected_observations, 6),
            "repeat_policy": observations_value["repeat_policy"],
        },
        "metrics": {
            "esf": round(_f_beta(penalty_recall, normal_pass_rate), 6),
            "sce": round(mean(absolute_errors), 6),
            "rcr": round(stable_groups / len(repeated_groups), 6) if repeated_groups else None,
            "weighted_penalty_recall": round(penalty_recall, 6),
            "normal_pass_rate": round(normal_pass_rate, 6),
        },
        "criterion_sce": {key: round(mean(values), 6) for key, values in sorted(by_criterion.items())},
        "disagreements": disagreements,
    }
    report["digest"] = canonical_digest(report, namespace="harbor-dsh-meta-evaluation-report-v1")
    return report


def run_meta_evaluation(
    *,
    project_root: Path,
    ground_truth_path: Path,
    observations_path: Path,
    output_path: Path,
) -> dict[str, Any]:
    project_root = project_root.expanduser().resolve(strict=True)
    ground_truth_path = resolve_inside(project_root, ground_truth_path, label="ground truth")
    observations_path = resolve_inside(project_root, observations_path, label="evaluator observations")
    output_path = _resolve_output(project_root, output_path, "meta-evaluation report")
    ground_truth, _ = load_ground_truth(ground_truth_path)
    report = meta_evaluate(ground_truth, _read_json(observations_path))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return {**report, "output": output_path.relative_to(project_root).as_posix()}
