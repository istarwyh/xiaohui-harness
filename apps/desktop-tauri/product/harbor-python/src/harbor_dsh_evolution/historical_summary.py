from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from statistics import mean
from typing import Any, Iterable

from harbor_dsh_evolution.historical_artifacts import (
    load_historical_assessments,
    validate_historical_job_artifacts,
)

JOB_KIND = "historical-generation-evaluation"


def summarize_historical_payloads(
    payloads: Iterable[dict[str, Any]],
    *,
    job_name: str,
    evaluation_context: dict[str, Any],
    artifact_validation: dict[str, Any],
    dataset_manifest: dict[str, Any],
    assessments: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    del payloads
    assessments = list(assessments)
    statuses = Counter(item.get("status") for item in assessments)
    criterion_statuses: Counter[str] = Counter()
    scored_values: list[float] = []
    trials: list[dict[str, Any]] = []
    exceptions: list[dict[str, Any]] = []
    for assessment in assessments:
        criterion_statuses.update(assessment.get("criterion_status_counts") or {})
        score = assessment.get("score") or {}
        if score.get("valid") and isinstance(score.get("value"), (int, float)):
            scored_values.append(float(score["value"]))
        if assessment.get("exception"):
            exceptions.append(
                {"trial": assessment.get("trial_id"), **assessment["exception"]}
            )
        trials.append(
            {
                "id": assessment.get("trial_id"),
                "name": assessment.get("trial_name"),
                "datasetTrial": assessment.get("dataset_trial"),
                "generationRecord": assessment.get("evaluation_target"),
                "status": assessment.get("status"),
                "score": score,
                "requirements": assessment.get("requirements"),
                "criteria": assessment.get("criteria"),
                "population": assessment.get("population"),
                "exception": assessment.get("exception"),
            }
        )
    total_trials = int(dataset_manifest.get("task_count") or len(assessments))
    scored_trials = statuses["completed"]
    unscored_trials = statuses["completed-unscored"]
    missing_trials = max(0, total_trials - len(assessments))
    if missing_trials:
        statuses["missing"] += missing_trials
    criterion_total = sum(criterion_statuses.values())
    criterion_scored = criterion_statuses["scored"]
    coverage = {
        "scored_trials": scored_trials,
        "unscored_trials": unscored_trials,
        "total_trials": total_trials,
        "trial_rate": round(scored_trials / total_trials, 6) if total_trials else 0.0,
        "criterion_scored": criterion_scored,
        "criterion_total": criterion_total,
        "criterion_rate": round(criterion_scored / criterion_total, 6)
        if criterion_total
        else 0.0,
    }
    meta = {
        "status": "not-run",
        "validation_report_ref": None,
    }
    return {
        "schema_version": 4,
        "job": job_name,
        "job_kind": JOB_KIND,
        "mode": "diagnostic",
        "execution_mode": "observe-existing",
        "evaluation_target": evaluation_context["evaluation_target"],
        "generation_source": evaluation_context["generation_source"],
        "evaluation_context": evaluation_context,
        "n_trials": total_trials,
        "n_discovered_trials": len(assessments),
        "n_completed_trials": scored_trials + unscored_trials,
        "n_valid_scores": scored_trials,
        "n_invalid_scores": max(0, total_trials - scored_trials - unscored_trials),
        "n_unscored_trials": unscored_trials,
        "n_exceptions": len(exceptions),
        "n_infrastructure_exceptions": statuses["infrastructure-error"],
        "n_evaluation_exceptions": statuses["evaluation-error"],
        "status_counts": dict(sorted(statuses.items())),
        "coverage": coverage,
        "criterion_status_counts": dict(sorted(criterion_statuses.items())),
        "metrics": {"reward": mean(scored_values)} if scored_values else {},
        "exceptions": exceptions,
        "trials": trials,
        "artifact_validation": artifact_validation,
        "evaluator_meta_evaluation": meta,
    }


def summarize_historical_job(job_dir: Path) -> dict[str, Any]:
    job_dir = job_dir.expanduser().resolve(strict=True)
    context = json.loads((job_dir / "evaluation-context.json").read_text())
    dataset = json.loads((job_dir / "dataset-manifest.json").read_text())
    assessments = load_historical_assessments(job_dir)
    validation = validate_historical_job_artifacts(
        job_dir,
        expected_trials=int(dataset.get("task_count") or 0),
    )
    return summarize_historical_payloads(
        [],
        job_name=job_dir.name,
        evaluation_context=context,
        artifact_validation=validation,
        dataset_manifest=dataset,
        assessments=assessments,
    )
