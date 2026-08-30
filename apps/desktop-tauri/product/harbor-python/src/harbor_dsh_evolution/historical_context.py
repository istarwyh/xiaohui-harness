from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

from harbor_dsh_evolution.dataset import load_validated_dataset
from harbor_dsh_evolution.identity import canonical_digest
from harbor_dsh_evolution.session_batch import GenerationBatch, load_generation_batch
from harbor_dsh_evolution.stack import snapshot_stack

CONTEXT_PROTOCOL = "historical-generation-evaluation-context/v1"
CONTEXT_NAME = "evaluation-context.json"
JOB_KIND = "historical-generation-evaluation"


def _package_version(package: str) -> str:
    try:
        return version(package)
    except PackageNotFoundError:
        return "unknown"


def _validate_cross_links(
    batch: GenerationBatch,
    dataset: dict[str, Any],
) -> None:
    if dataset.get("dataset_kind") != "historical-generation":
        raise ValueError("Historical Evaluation requires a historical-generation Dataset")
    if dataset.get("source_kind") != "dsh-session":
        raise ValueError("Historical Evaluation Dataset source_kind must be dsh-session")
    metadata = dataset.get("metadata") or {}
    if metadata.get("batch_id") != batch.manifest["batch_id"]:
        raise ValueError("Historical Dataset batch_id does not match Generation Batch")
    if metadata.get("batch_digest") != batch.manifest["digest"]:
        raise ValueError("Historical Dataset batch_digest does not match Generation Batch")
    if dataset.get("task_count") != len(batch.manifest["records"]):
        raise ValueError("Historical Dataset task count does not match Generation Batch")
    dataset_record_ids = [
        str((task.get("metadata") or {}).get("generation_record_id"))
        for task in dataset.get("tasks") or []
        if isinstance(task, dict)
    ]
    batch_record_ids = [str(record["trial_id"]) for record in batch.manifest["records"]]
    if dataset_record_ids != batch_record_ids:
        raise ValueError(
            "Historical Dataset record order does not match Generation Batch"
        )


def build_historical_context(
    *,
    project_root: Path,
    batch_path: Path,
    dataset_path: Path,
    stack_path: Path,
    mode: str = "diagnostic",
) -> dict[str, Any]:
    if mode != "diagnostic":
        raise ValueError("Historical Generation Evaluation is diagnostic-only")
    project_root = project_root.expanduser().resolve(strict=True)
    batch = load_generation_batch(batch_path, project_root=project_root)
    dataset = load_validated_dataset(dataset_path, project_root=project_root)
    _validate_cross_links(batch, dataset)
    stack = snapshot_stack(
        stack_path,
        project_root=project_root,
        job_kind=JOB_KIND,
    )
    agent_source = Path(__file__).with_name("session_agent.py")
    adapter_identity = {
        "id": "dsh-session-observation-adapter",
        "version": "1.0.0",
        "import_path": "harbor_dsh_evolution.session_agent:SessionObservationAgent",
        "digest": canonical_digest(
            {"source": agent_source.read_text()},
            namespace="harbor-dsh-session-observation-adapter-v1",
        ),
        "model_invocation": False,
        "tool_reexecution": False,
    }
    evaluation_target = {
        "kind": "generation-record-batch",
        "source_kind": "dsh-session",
        "batch_id": batch.manifest["batch_id"],
        "digest": batch.manifest["digest"],
        "record_count": len(batch.manifest["records"]),
        "generator_population": batch.manifest.get("generator_population") or {},
    }
    dataset_identity = {
        "dataset_id": dataset["dataset_id"],
        "version": dataset["version"],
        "source_digest": dataset["source_digest"],
        "task_count": dataset["task_count"],
        "dataset_kind": dataset["dataset_kind"],
        "source_kind": dataset["source_kind"],
    }
    stack_identity = {
        "stack_id": stack["stack_id"],
        "version": stack["version"],
        "digest": stack["digest"],
        "comparison_digest": stack["comparison_digest"],
        "components": stack["components"],
        "judge": stack["judge"],
    }
    runtime = {
        "harbor_version": _package_version("harbor"),
        "integration_version": _package_version("harbor-dsh-evolution"),
    }
    comparison_identity = {
        "evaluation_target": evaluation_target,
        "dataset": dataset_identity,
        "stack_comparison_digest": stack["comparison_digest"],
        "execution_adapter": adapter_identity,
        "runtime": runtime,
    }
    context = {
        "schema_version": 1,
        "protocol": CONTEXT_PROTOCOL,
        "job_kind": JOB_KIND,
        "mode": "diagnostic",
        "promotion_eligible": False,
        "evaluation_level": "trial",
        "execution_mode": "observe-existing",
        "evaluation_target": evaluation_target,
        "generation_source": {
            "kind": "dsh-session",
            "mode": "existing-records",
            "adapter": batch.manifest["source"]["adapter"],
            "adapter_id": batch.manifest["source"]["adapter"],
            "selection": batch.manifest["selection"],
            "redaction_policy": batch.manifest["redaction_policy"],
        },
        "dataset": dataset_identity,
        "evaluation_stack": stack_identity,
        "execution_adapter": adapter_identity,
        "runtime": runtime,
        "downstream_analysis": {
            "population_analysis": True,
            "generator_diagnosis": {"status": "job-owned"},
            "optimizer": {"status": "diagnostic-only"},
            "evaluator_meta_evaluation": {
                "status": "not-run",
                "validation_report_ref": None,
            },
        },
    }
    context["digest"] = canonical_digest(
        comparison_identity,
        namespace="harbor-dsh-historical-evaluation-context-v1",
    )
    context["full_digest"] = canonical_digest(
        context,
        namespace="harbor-dsh-historical-evaluation-audit-v1",
    )
    return context
