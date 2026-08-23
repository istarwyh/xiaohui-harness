from __future__ import annotations

import json
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

from harbor_dsh_evolution.candidate import CandidateManifest
from harbor_dsh_evolution.dataset import load_validated_dataset
from harbor_dsh_evolution.identity import canonical_digest, tree_digest
from harbor_dsh_evolution.stack import snapshot_stack

CONTEXT_NAME = "evaluation-context.json"


def _package_version(package: str) -> str:
    try:
        return version(package)
    except PackageNotFoundError:
        return "unknown"


def normalize_candidate_model_binding(value: dict[str, Any]) -> dict[str, str]:
    required = ("provider", "model", "transport", "protocol")
    if not isinstance(value, dict) or not all(
        isinstance(value.get(key), str) and value[key].strip() for key in required
    ):
        raise ValueError(
            "Candidate model binding requires provider, model, transport, and protocol"
        )
    return {
        key: value[key].strip()
        for key in (*required, "reasoning_effort")
        if isinstance(value.get(key), str) and value[key].strip()
    }


def build_evaluation_context(
    dataset_dir: Path,
    *,
    candidate: CandidateManifest,
    stack_path: Path,
    project_root: Path,
    mode: str,
    candidate_model_binding: dict[str, Any],
) -> dict[str, Any]:
    if mode not in {"diagnostic", "promotion-eligible"}:
        raise ValueError("mode must be diagnostic or promotion-eligible")
    project_root = project_root.expanduser().resolve(strict=True)
    dataset = load_validated_dataset(dataset_dir, project_root=project_root)
    stack = snapshot_stack(stack_path, project_root=project_root)
    model_binding = normalize_candidate_model_binding(candidate_model_binding)
    integration_digest, _ = tree_digest(
        Path(__file__).parent,
        namespace="harbor-dsh-integration-runtime-v2",
    )
    runtime = {
        "harbor_version": _package_version("harbor"),
        "integration_version": _package_version("harbor-dsh-evolution"),
        "integration_digest": integration_digest,
    }
    candidate_identity = {
        "candidate_id": candidate.candidate_id,
        "version": candidate.version,
        "digest": candidate.digest,
        "runtime": candidate.runtime,
    }
    dataset_identity = {
        "dataset_id": dataset["dataset_id"],
        "version": dataset["version"],
        "source_digest": dataset["source_digest"],
        "task_count": dataset["task_count"],
    }
    stack_identity = {
        "stack_id": stack["stack_id"],
        "version": stack["version"],
        "digest": stack["digest"],
        "comparison_digest": stack["comparison_digest"],
        "components": stack["components"],
        "judge": stack["judge"],
    }
    comparison_identity = {
        "dataset": dataset_identity,
        "stack_comparison_digest": stack["comparison_digest"],
        "candidate_model_binding": model_binding,
        "runtime": runtime,
    }
    context = {
        "schema_version": 2,
        "digest": canonical_digest(
            comparison_identity,
            namespace="harbor-dsh-evaluation-context-v2",
        ),
        "full_digest": canonical_digest(
            {
                "candidate": candidate_identity,
                "dataset": dataset_identity,
                "stack": stack_identity,
                "candidate_model_binding": model_binding,
                "runtime": runtime,
                "mode": mode,
            },
            namespace="harbor-dsh-evaluation-audit-v2",
        ),
        "mode": mode,
        "candidate": candidate_identity,
        "dataset": dataset_identity,
        "evaluation_stack": stack_identity,
        "candidate_model_binding": model_binding,
        "runtime": runtime,
    }
    return context


def context_preview(
    *,
    project_root: Path,
    candidate: CandidateManifest,
    dataset_dir: Path,
    stack_path: Path,
    jobs_dir: Path,
    mode: str,
    candidate_model_binding: dict[str, Any],
) -> dict[str, Any]:
    expected = build_evaluation_context(
        dataset_dir,
        candidate=candidate,
        stack_path=stack_path,
        project_root=project_root,
        mode=mode,
        candidate_model_binding=candidate_model_binding,
    )
    compatible: list[dict[str, Any]] = []
    incompatible: list[dict[str, Any]] = []
    jobs_dir = jobs_dir.expanduser().resolve()
    if jobs_dir.is_dir():
        for context_file in sorted(jobs_dir.glob(f"*/{CONTEXT_NAME}")):
            try:
                value = json.loads(context_file.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            job = context_file.parent.name
            if value.get("schema_version") != 2:
                incompatible.append({"job": job, "reason": "CONTEXT_SCHEMA_UNSUPPORTED"})
            elif value.get("mode") != mode:
                incompatible.append({"job": job, "reason": "JOB_MODE_MISMATCH"})
            elif value.get("digest") != expected["digest"]:
                incompatible.append({"job": job, "reason": "EVALUATION_CONTEXT_MISMATCH"})
            elif (value.get("candidate") or {}).get("digest") == candidate.digest:
                incompatible.append({"job": job, "reason": "CANDIDATE_DIGEST_UNCHANGED"})
            else:
                compatible.append(
                    {
                        "job": job,
                        "candidate": value.get("candidate"),
                        "context_digest": value.get("digest"),
                    }
                )
    return {
        "schema_version": 1,
        "expected_context": expected,
        "comparable_baselines": compatible,
        "incompatible_baselines": incompatible,
        "fresh_baseline_required": not compatible,
    }
