from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Iterable

from harbor_dsh_evolution.artifacts import trial_assessment, validate_job_artifacts
from harbor_dsh_evolution.context import CONTEXT_NAME

SUMMARY_NAME = "evaluation-summary.json"


def _trial_payloads(job_dir: Path) -> list[dict[str, Any]]:
    payloads = []
    for path in sorted(job_dir.glob("*/result.json")):
        payload = json.loads(path.read_text())
        if "agent_info" in payload:
            payloads.append(payload)
    return payloads


def summarize_payloads(
    payloads: Iterable[dict[str, Any]],
    *,
    job_name: str,
    candidate: dict[str, Any] | None = None,
    evaluation_context: dict[str, Any] | None = None,
    artifact_validation: dict[str, Any] | None = None,
    evaluation_contract: dict[str, Any] | None = None,
    dataset_manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    values: dict[str, list[float]] = defaultdict(list)
    exceptions: list[dict[str, str]] = []
    trials: list[dict[str, Any]] = []
    statuses: Counter[str] = Counter()
    contract = evaluation_contract or {
        "primary_metric": "reward",
        "metrics": [{"id": "reward", "direction": "maximize"}],
        "hard_requirements": [],
    }
    task_lookup = {
        str(task.get("id")): task
        for task in (dataset_manifest or {}).get("tasks", [])
        if isinstance(task, dict) and task.get("id")
    }
    for payload in payloads:
        assessment = trial_assessment(
            payload,
            evaluation_contract=contract,
            task=task_lookup.get(str(payload.get("task_name"))) or {},
        )
        statuses[assessment["status"]] += 1
        if assessment["score"]["valid"]:
            for key, value in assessment["raw_rewards"].items():
                values[key].append(value)
        current_exception = assessment["exception"]
        if current_exception:
            exceptions.append({"trial": assessment["trial_id"], **current_exception})
        trials.append(
            {
                "id": assessment["trial_id"],
                "name": assessment["trial_name"],
                "datasetTrial": assessment["dataset_trial"],
                "status": assessment["status"],
                "score": assessment["score"],
                "requirements": assessment["requirements"],
                "rewards": assessment["raw_rewards"],
                "population": assessment["population"],
                "exception": current_exception,
            }
        )

    dataset_total = int(
        (evaluation_context or {}).get("dataset", {}).get("task_count")
        or (dataset_manifest or {}).get("task_count")
        or len(trials)
    )
    valid_scores = sum(bool(trial["score"]["valid"]) for trial in trials)
    return {
        "schema_version": 3,
        "job": job_name,
        "mode": (evaluation_context or {}).get("mode"),
        "candidate": candidate,
        "evaluation_context": evaluation_context,
        "n_trials": dataset_total,
        "n_discovered_trials": len(trials),
        "n_completed_trials": sum(statuses.values()),
        "n_valid_scores": valid_scores,
        "n_invalid_scores": len(trials) - valid_scores,
        "n_exceptions": len(exceptions),
        "n_infrastructure_exceptions": statuses["infrastructure-error"],
        "n_evaluation_exceptions": statuses["evaluation-error"],
        "status_counts": dict(sorted(statuses.items())),
        "metrics": {key: mean(items) for key, items in sorted(values.items())},
        "exceptions": exceptions,
        "trials": trials,
        "artifact_validation": artifact_validation or {"valid": False, "findings": [{"level": "error", "code": "ARTIFACT_VALIDATION_MISSING", "message": "Artifacts were not validated"}]},
    }


def summarize_job(job_dir: Path) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve(strict=True)
    candidate_path = job_dir / "candidate-manifest.json"
    candidate = json.loads(candidate_path.read_text()) if candidate_path.exists() else None
    context_path = job_dir / CONTEXT_NAME
    evaluation_context = json.loads(context_path.read_text()) if context_path.exists() else None
    contract_path = job_dir / "evaluation-contract.json"
    evaluation_contract = json.loads(contract_path.read_text()) if contract_path.exists() else None
    dataset_path = job_dir / "dataset-manifest.json"
    dataset_manifest = json.loads(dataset_path.read_text()) if dataset_path.exists() else None
    payloads = _trial_payloads(job_dir)
    return summarize_payloads(
        payloads,
        job_name=job_dir.name,
        candidate=candidate,
        evaluation_context=evaluation_context,
        artifact_validation=validate_job_artifacts(job_dir, expected_trials=len(payloads)),
        evaluation_contract=evaluation_contract,
        dataset_manifest=dataset_manifest,
    )


def write_summary(job_dir: Path, summary: dict[str, Any]) -> Path:
    output = job_dir / SUMMARY_NAME
    output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    return output


def load_or_create_summary(job_dir: Path) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve(strict=True)
    path = job_dir / SUMMARY_NAME
    if path.exists():
        return json.loads(path.read_text())
    summary = summarize_job(job_dir)
    write_summary(job_dir, summary)
    return summary
