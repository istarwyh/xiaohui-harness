from __future__ import annotations

import json
import re
import shutil
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Iterable
from urllib.parse import unquote, urlparse

from harbor_dsh_evolution.artifacts import redact
from harbor_dsh_evolution.evaluator import validate_evaluation_result
from harbor_dsh_evolution.session_batch import validate_session_observation

JOB_KIND = "historical-generation-evaluation"
HISTORICAL_REQUIREMENTS = (
    "input_integrity",
    "observation_integrity",
    "adapter_completed",
    "renderer_valid",
    "judge_completed",
    "artifact_schema_valid",
)
MAX_ARTIFACT_BYTES = 2 * 1024 * 1024


def _safe_name(value: str, fallback: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip(".-") or fallback


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(redact(value), ensure_ascii=False, indent=2) + "\n")


def _safe_trial_dir(payload: dict[str, Any], job_dir: Path) -> Path | None:
    uri = payload.get("trial_uri")
    if not isinstance(uri, str):
        return None
    parsed = urlparse(uri)
    if parsed.scheme not in {"", "file"}:
        return None
    try:
        candidate = Path(unquote(parsed.path if parsed.scheme else uri)).resolve(strict=True)
        root = job_dir.resolve(strict=True)
    except (FileNotFoundError, OSError):
        return None
    if candidate.parent != root or not candidate.is_dir() or candidate.is_symlink():
        return None
    return candidate


def _safe_json(path: Path, root: Path) -> dict[str, Any] | None:
    try:
        resolved = path.resolve(strict=True)
        boundary = root.resolve(strict=True)
        if resolved.is_symlink() or not resolved.is_file():
            return None
        if resolved != boundary and boundary not in resolved.parents:
            return None
        if resolved.stat().st_size > MAX_ARTIFACT_BYTES:
            return None
        value = json.loads(resolved.read_text())
        return value if isinstance(value, dict) else None
    except (FileNotFoundError, OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None


def _trial_evaluator_result(payload: dict[str, Any], job_dir: Path) -> dict[str, Any] | None:
    trial = _safe_trial_dir(payload, job_dir)
    if trial is None:
        value = payload.get("evaluator_result")
        return value if isinstance(value, dict) else None
    return _safe_json(trial / "verifier" / "evaluation-result.json", trial / "verifier")


def _trial_observation(payload: dict[str, Any], job_dir: Path) -> dict[str, Any] | None:
    trial = _safe_trial_dir(payload, job_dir)
    if trial is None:
        value = payload.get("session_observation")
        return value if isinstance(value, dict) else None
    artifact_root = trial / "artifacts"
    if not artifact_root.is_dir() or artifact_root.is_symlink():
        return None
    for candidate in sorted(artifact_root.rglob("session-observation.json")):
        value = _safe_json(candidate, artifact_root)
        if value is not None:
            return value
    return None


def _task_lookup(dataset_manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for task in dataset_manifest.get("tasks") or []:
        if not isinstance(task, dict):
            continue
        metadata = task.get("metadata") if isinstance(task.get("metadata"), dict) else {}
        for value in (
            task.get("id"),
            task.get("path"),
            metadata.get("task_name"),
            metadata.get("generation_record_id"),
        ):
            normalized = str(value or "").strip().strip("/")
            if normalized:
                lookup[normalized] = task
                lookup[normalized.rsplit("/", 1)[-1]] = task
    return lookup


def _task_for(payload: dict[str, Any], lookup: dict[str, dict[str, Any]]) -> dict[str, Any]:
    for value in (payload.get("task_name"), payload.get("trial_name"), payload.get("id")):
        normalized = str(value or "").strip().strip("/")
        if normalized in lookup:
            return lookup[normalized]
        if normalized.rsplit("/", 1)[-1] in lookup:
            return lookup[normalized.rsplit("/", 1)[-1]]
    return {}


def _exception(value: Any) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    return {
        "type": str(value.get("exception_type") or "Exception"),
        "classification": "infrastructure",
        "message": "Execution failed. Inspect the local Harbor Trial log for authorized diagnostics.",
    }


def historical_trial_assessment(
    payload: dict[str, Any],
    *,
    job_dir: Path,
    task: dict[str, Any],
    evaluator_interface: dict[str, Any],
) -> dict[str, Any]:
    metadata = task.get("metadata") if isinstance(task.get("metadata"), dict) else {}
    record_id = str(metadata.get("generation_record_id") or payload.get("task_name") or "unknown")
    exception = _exception(payload.get("exception_info"))
    observation = _trial_observation(payload, job_dir)
    observation_error: str | None = None
    try:
        if observation is None:
            raise ValueError("session-observation.json is missing")
        validate_session_observation(observation, expected_trial_id=record_id)
        expected_digest = metadata.get("observation_digest")
        if expected_digest and observation.get("digest") != expected_digest:
            raise ValueError("Session Observation does not match Dataset metadata")
    except ValueError as error:
        observation_error = str(error)

    evaluator_result = _trial_evaluator_result(payload, job_dir)
    normalized: dict[str, Any] | None = None
    evaluator_error: str | None = None
    try:
        if evaluator_result is None:
            raise ValueError("evaluation-result.json is missing")
        normalized = validate_evaluation_result(
            evaluator_result,
            criteria=list(evaluator_interface.get("criteria") or []),
            aggregate=evaluator_interface.get("aggregate"),
        )
    except ValueError as error:
        evaluator_error = str(error)

    query = str(
        ((observation or {}).get("task") or {}).get("initial_user_goal")
        or metadata.get("query")
        or ""
    )
    requirements = {
        "input_integrity": bool(query.strip()),
        "observation_integrity": observation_error is None,
        "adapter_completed": exception is None
        and payload.get("agent_result") is not None
        and observation_error is None,
        "renderer_valid": observation_error is None,
        "judge_completed": exception is None
        and evaluator_error is None
        and not (normalized or {}).get("criterion_status_counts", {}).get(
            "evaluation-error", 0
        ),
        "artifact_schema_valid": observation_error is None and evaluator_error is None,
    }
    invalid_reasons: list[str] = []
    if exception:
        invalid_reasons.append("infrastructure-error")
    if observation_error:
        invalid_reasons.append(f"observation-invalid:{observation_error}")
    if evaluator_error:
        invalid_reasons.append(f"evaluator-result-invalid:{evaluator_error}")
    if normalized is not None and not normalized["score_valid"]:
        if normalized["aggregate"]["scored_criteria"] == 0:
            invalid_reasons.append("criteria-unscored")
        if not normalized["required_criteria_scored"]:
            invalid_reasons.append("required-criteria-unscored")
        if not normalized["coverage_satisfied"]:
            invalid_reasons.append("criterion-coverage-below-minimum")
        if normalized["criterion_status_counts"].get("evaluation-error"):
            invalid_reasons.append("criterion-evaluation-error")
    for requirement, passed in requirements.items():
        if not passed:
            invalid_reasons.append(f"requirement-failed:{requirement}")
    invalid_reasons = list(dict.fromkeys(invalid_reasons))

    if exception:
        status = "infrastructure-error"
    elif observation_error or evaluator_error:
        status = "evaluation-error"
    elif (normalized or {}).get("criterion_status_counts", {}).get(
        "evaluation-error", 0
    ):
        status = "evaluation-error"
    elif normalized is not None and normalized["score_valid"]:
        status = "completed"
    else:
        status = "completed-unscored"

    details = (normalized or {}).get("details") or {}
    criteria = [
        {
            "id": identity,
            "label": criterion.get("label") or identity,
            **details.get(identity, {
                "status": "evaluation-error",
                "score": None,
                "reason": evaluator_error or "Evaluator result unavailable.",
                "recommendation": "Repair the Evaluator result and rerun the frozen Generation Record.",
                "evidence_refs": [],
                "required": bool(criterion.get("required", False)),
            }),
        }
        for criterion in evaluator_interface.get("criteria") or []
        for identity in [str(criterion.get("id"))]
    ]
    transcript = (observation or {}).get("visible_transcript") or []
    final_assistant = next(
        (item for item in reversed(transcript) if isinstance(item, dict) and item.get("role") == "assistant"),
        None,
    )
    score_value = (normalized or {}).get("reward") if status == "completed" else None
    return redact(
        {
            "schema_version": 3,
            "job_kind": JOB_KIND,
            "evaluation_target": {
                "kind": "generation-record",
                "record_kind": "dsh-session",
                "record_id": record_id,
                "source_ref": metadata.get("source_ref"),
                "observation_digest": metadata.get("observation_digest"),
            },
            "trial_id": str(payload.get("id") or payload.get("trial_name") or record_id),
            "trial_name": str(payload.get("trial_name") or record_id),
            "dataset_trial": str(task.get("id") or payload.get("task_name") or record_id),
            "query": query,
            "population": (observation or {}).get("generator") or {},
            "status": status,
            "score": {
                "value": score_value,
                "valid": status == "completed" and isinstance(score_value, (int, float)),
                "invalid_reasons": invalid_reasons,
            },
            "requirements": requirements,
            "criteria": criteria,
            "criterion_coverage": (normalized or {}).get("coverage", 0.0),
            "criterion_status_counts": (normalized or {}).get(
                "criterion_status_counts",
                {"scored": 0, "not-applicable": 0, "insufficient-evidence": 0, "evaluation-error": len(criteria)},
            ),
            "output": final_assistant,
            "evidence_provenance": [
                {
                    "id": "frozen-session-observation",
                    "kind": "historical-generation-record",
                    "artifact_ref": "artifacts/session-observation.json",
                    "reward_affecting": True,
                },
                {
                    "id": "evaluator-result-v2",
                    "kind": "evaluator-result",
                    "artifact_ref": "verifier/evaluation-result.json",
                    "reward_affecting": True,
                },
            ],
            "exception": exception,
        }
    )


def _reports(
    assessments: list[dict[str, Any]],
    stack_manifest: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    statuses = Counter(item["status"] for item in assessments)
    criterion_statuses: Counter[str] = Counter()
    metrics: dict[str, list[float]] = defaultdict(list)
    for assessment in assessments:
        criterion_statuses.update(assessment["criterion_status_counts"])
        if assessment["score"]["valid"]:
            metrics["reward"].append(float(assessment["score"]["value"]))
    total_criteria = sum(criterion_statuses.values())
    scored_criteria = criterion_statuses["scored"]
    population = {
        "schema_version": 3,
        "job_kind": JOB_KIND,
        "population_size": len(assessments),
        "valid_population_size": statuses["completed"],
        "unscored_population_size": statuses["completed-unscored"],
        "status_counts": dict(sorted(statuses.items())),
        "coverage": {
            "scored_trials": statuses["completed"],
            "unscored_trials": statuses["completed-unscored"],
            "total_trials": len(assessments),
            "trial_rate": round(statuses["completed"] / len(assessments), 6) if assessments else 0.0,
            "criterion_scored": scored_criteria,
            "criterion_total": total_criteria,
            "criterion_rate": round(scored_criteria / total_criteria, 6) if total_criteria else 0.0,
        },
        "criterion_status_counts": dict(sorted(criterion_statuses.items())),
        "metrics": {key: mean(values) for key, values in metrics.items()},
    }
    grouped: dict[str, list[str]] = defaultdict(list)
    low_scores: dict[tuple[str, str, str, tuple[str, ...]], list[str]] = defaultdict(list)
    for assessment in assessments:
        for reason in assessment["score"]["invalid_reasons"]:
            grouped[reason].append(assessment["evaluation_target"]["record_id"])
        for criterion in assessment.get("criteria") or []:
            score = criterion.get("score")
            if (
                criterion.get("status") == "scored"
                and isinstance(score, (int, float))
                and not isinstance(score, bool)
                and float(score) < 1
            ):
                key = (
                    str(criterion.get("id") or "unknown"),
                    str(criterion.get("reason") or "Low historical evaluation score."),
                    str(
                        criterion.get("recommendation")
                        or "Improve this generator-owned behavior and collect a new record."
                    ),
                    tuple(str(ref) for ref in criterion.get("evidence_refs") or []),
                )
                low_scores[key].append(assessment["evaluation_target"]["record_id"])
    diagnoser = (stack_manifest.get("components") or {}).get("diagnoser") or {}
    diagnosis = {
        "schema_version": 2,
        "job_kind": JOB_KIND,
        "hook": {
            "id": "harbor-dsh-historical-diagnoser",
            "version": "1.0.0",
            "status": "completed",
            "reward_affecting": False,
            "configured_component": {
                "id": diagnoser.get("id"),
                "version": diagnoser.get("version"),
                "executed": False,
            },
        },
        "diagnoses": [
            {
                "root_cause": reason,
                "owner": "evaluation-stack" if "evaluator" in reason or "criterion" in reason else "generation-record",
                "affected_records": records,
                "evidence_refs": [f"trial-assessments/{record}.json" for record in records],
            }
            for reason, records in sorted(grouped.items())
        ]
        + [
            {
                "root_cause": f"generator-quality:{criterion_id}",
                "owner": "generator",
                "criterion_id": criterion_id,
                "reason": reason,
                "recommendation": recommendation,
                "affected_records": records,
                "evidence_refs": [
                    f"trial-assessments/{record}.json" for record in records
                ],
                "criterion_evidence_refs": list(evidence_refs),
            }
            for (
                criterion_id,
                reason,
                recommendation,
                evidence_refs,
            ), records in sorted(low_scores.items())
        ],
    }
    optimizer = (stack_manifest.get("components") or {}).get("optimizer") or {}
    hypotheses = []
    if low_scores:
        (
            criterion_id,
            reason,
            recommendation,
            evidence_refs,
        ), records = next(iter(sorted(low_scores.items())))
        hypotheses.append(
            {
                "id": f"improve-{_safe_name(criterion_id, 'historical-quality')}",
                "owner": "generator",
                "root_cause": f"generator-quality:{criterion_id}",
                "reason": reason,
                "affected_records": records,
                "evidence_refs": [
                    f"trial-assessments/{record}.json" for record in records
                ],
                "criterion_evidence_refs": list(evidence_refs),
                "mutation_surface": ["generator-composition"],
                "forbidden_surface": [
                    "frozen-generation-record",
                    "evaluator",
                    "rubric",
                    "ground-truth",
                ],
                "next_experiment": recommendation,
            }
        )
    elif grouped:
        reason, records = next(iter(sorted(grouped.items())))
        hypotheses.append(
            {
                "id": "investigate-historical-generation-signal",
                "owner": "generator",
                "root_cause": reason,
                "affected_records": records,
                "mutation_surface": ["generator-composition"],
                "forbidden_surface": ["frozen-generation-record", "evaluator", "rubric", "ground-truth"],
                "next_experiment": "Change one generator-owned behavior, collect a new Session batch, and evaluate it independently.",
            }
        )
    optimization = {
        "schema_version": 3,
        "job_kind": JOB_KIND,
        "mode": "diagnostic",
        "hook": {
            "id": "harbor-dsh-historical-optimizer",
            "version": "1.0.0",
            "status": "completed",
            "reward_affecting": False,
            "configured_component": {
                "id": optimizer.get("id"),
                "version": optimizer.get("version"),
                "executed": False,
            },
        },
        "hypotheses": hypotheses[:1],
        "evaluator_meta_evaluation": {
            "status": "not-run",
            "validation_report_ref": None,
        },
    }
    return population, diagnosis, optimization


def write_historical_job_artifacts(
    job_dir: Path,
    payloads: Iterable[dict[str, Any]],
    *,
    dataset_manifest: dict[str, Any],
    stack_manifest: dict[str, Any],
) -> dict[str, Any]:
    payloads = list(payloads)
    evaluator_interface = (
        ((stack_manifest.get("components") or {}).get("evaluator") or {}).get("interface")
        or {}
    )
    _write_json(
        job_dir / "evaluation-contract.json",
        {"schema_version": 1, "job_kind": JOB_KIND, **stack_manifest["evaluation_contract"]},
    )
    lookup = _task_lookup(dataset_manifest)
    assessment_dir = job_dir / "trial-assessments"
    if assessment_dir.is_symlink() or (
        assessment_dir.exists() and not assessment_dir.is_dir()
    ):
        raise ValueError("Historical Trial assessment path is not a safe directory")
    if assessment_dir.exists():
        shutil.rmtree(assessment_dir)
    assessment_dir.mkdir()
    assessments: list[dict[str, Any]] = []
    paths: list[Path] = []
    for index, payload in enumerate(payloads, start=1):
        assessment = historical_trial_assessment(
            payload,
            job_dir=job_dir,
            task=_task_for(payload, lookup),
            evaluator_interface=evaluator_interface,
        )
        assessments.append(assessment)
        name = _safe_name(assessment["evaluation_target"]["record_id"], f"trial-{index}")
        target = assessment_dir / f"{name}.json"
        _write_json(target, assessment)
        paths.append(target)
    population, diagnosis, optimization = _reports(assessments, stack_manifest)
    _write_json(job_dir / "population-report.json", population)
    _write_json(job_dir / "diagnosis-report.json", diagnosis)
    _write_json(job_dir / "optimization-report.json", optimization)
    artifact_specs = [
        ("generation-source", "Generation Batch", "generation-batch-manifest.json", False),
        ("dataset", "Dataset Manifest", "dataset-manifest.json", False),
        ("evaluation-stack", "Evaluation Context", "evaluation-context.json", True),
        ("evaluation-stack", "Evaluation Contract", "evaluation-contract.json", True),
        ("reporter", "Population Report", "population-report.json", False),
        ("diagnoser", "Diagnosis Report", "diagnosis-report.json", False),
        ("optimizer", "Optimization Report", "optimization-report.json", False),
        ("runner", "Trial Lifecycle", "trial-lifecycle.json", False),
    ]
    artifact_specs.extend(
        ("judge", "Historical Trial Assessment", path.relative_to(job_dir).as_posix(), True)
        for path in paths
    )
    registry = {
        "schema_version": 2,
        "job_kind": JOB_KIND,
        "artifacts": [
            {
                "role": role,
                "artifact": artifact,
                "path": relative,
                "reward_affecting": reward_affecting,
                "status": "registered" if (job_dir / relative).is_file() else "unavailable",
            }
            for role, artifact, relative, reward_affecting in artifact_specs
        ],
    }
    _write_json(job_dir / "artifact-registry.json", registry)
    return validate_historical_job_artifacts(
        job_dir,
        expected_trials=int(dataset_manifest.get("task_count") or 0),
    )


def load_historical_assessments(job_dir: Path) -> list[dict[str, Any]]:
    directory = job_dir / "trial-assessments"
    if not directory.is_dir():
        return []
    return [json.loads(path.read_text()) for path in sorted(directory.glob("*.json"))]


def validate_historical_job_artifacts(
    job_dir: Path,
    *,
    expected_trials: int | None = None,
) -> dict[str, Any]:
    findings: list[dict[str, str]] = []
    required_versions = {
        "evaluation-contract.json": 1,
        "population-report.json": 3,
        "diagnosis-report.json": 2,
        "optimization-report.json": 3,
        "artifact-registry.json": 2,
    }
    for name, version in required_versions.items():
        try:
            value = json.loads((job_dir / name).read_text())
            if value.get("schema_version") != version or value.get("job_kind") != JOB_KIND:
                raise ValueError("schema_version or job_kind mismatch")
        except (FileNotFoundError, OSError, json.JSONDecodeError, ValueError) as error:
            findings.append(
                {"level": "error", "code": "HISTORICAL_ARTIFACT_INVALID", "message": f"{name}: {error}"}
            )
    assessments = load_historical_assessments(job_dir)
    if expected_trials is not None and len(assessments) != expected_trials:
        findings.append(
            {
                "level": "error",
                "code": "TRIAL_ASSESSMENT_COUNT_MISMATCH",
                "message": "Historical Trial assessment count does not match Job trials",
            }
        )
    for assessment in assessments:
        if (
            assessment.get("schema_version") != 3
            or assessment.get("job_kind") != JOB_KIND
            or assessment.get("status")
            not in {"completed", "completed-unscored", "infrastructure-error", "evaluation-error", "cancelled"}
            or set(HISTORICAL_REQUIREMENTS) - set(assessment.get("requirements") or {})
        ):
            findings.append(
                {
                    "level": "error",
                    "code": "HISTORICAL_ASSESSMENT_INVALID",
                    "message": f"Historical Trial assessment {assessment.get('trial_id')} is invalid",
                }
            )
    return {
        "valid": not findings,
        "checked": len(required_versions) + len(assessments),
        "findings": findings,
    }
