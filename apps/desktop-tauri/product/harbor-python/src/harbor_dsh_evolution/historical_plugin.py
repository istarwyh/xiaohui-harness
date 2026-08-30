from __future__ import annotations

import json
import os
from pathlib import Path
from typing import override

from harbor.job import Job
from harbor.models.job.plugin import BaseJobPlugin
from harbor.models.job.result import JobResult
from harbor.trial.hooks import TrialHookEvent

from harbor_dsh_evolution.dataset import (
    MANIFEST_NAME as DATASET_MANIFEST_NAME,
    PREVIEW_NAME as DATASET_PREVIEW_NAME,
    build_dataset_preview,
    load_validated_dataset,
)
from harbor_dsh_evolution.historical_artifacts import (
    load_historical_assessments,
    write_historical_job_artifacts,
)
from harbor_dsh_evolution.historical_context import (
    CONTEXT_NAME,
    JOB_KIND,
    build_historical_context,
)
from harbor_dsh_evolution.historical_summary import summarize_historical_payloads
from harbor_dsh_evolution.lifecycle import TrialLifecycleStore, terminal_phase
from harbor_dsh_evolution.session_batch import (
    BATCH_MANIFEST_NAME,
    load_generation_batch,
)
from harbor_dsh_evolution.stack import (
    STACK_MANIFEST_NAME,
    STACK_SOURCES_NAME,
    snapshot_stack,
    snapshot_stack_sources,
)
from harbor_dsh_evolution.summary import SUMMARY_NAME, write_summary

COMPLETION_SENTINEL = "historical-evaluation-complete.json"


def _atomic_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix(f"{path.suffix}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


class HistoricalGenerationEvaluationPlugin(BaseJobPlugin):
    """Evaluate immutable DSH Session observations without rerunning their generator."""

    def __init__(
        self,
        *,
        batch_path: str,
        dataset_path: str,
        stack_path: str,
        project_root: str,
        mode: str = "diagnostic",
    ) -> None:
        super().__init__()
        self._project_root = Path(project_root).expanduser().resolve(strict=True)
        self._batch_path = Path(batch_path)
        self._dataset_path = Path(dataset_path)
        self._stack_path = Path(stack_path)
        if mode != "diagnostic":
            raise ValueError("Historical Generation Evaluation is diagnostic-only")
        self._mode = mode
        self._job_dir: Path | None = None
        self._batch = None
        self._dataset_manifest: dict | None = None
        self._stack_manifest: dict | None = None
        self._context: dict | None = None
        self._lifecycle: TrialLifecycleStore | None = None
        self._events_path: Path | None = None

    def _resolve_project_path(self, path: Path) -> Path:
        requested = path.expanduser()
        if not requested.is_absolute():
            requested = self._project_root / requested
        return requested.resolve(strict=True)

    @override
    async def on_job_start(self, job: Job) -> None:
        self._job_dir = job.job_dir
        self._job_dir.mkdir(parents=True, exist_ok=True)
        # Harbor 0.21 can resume an existing Job directory. Invalidate the old
        # success marker before any validation or callback registration so a
        # failed plugin finalization can never inherit a previous completion.
        (self._job_dir / COMPLETION_SENTINEL).unlink(missing_ok=True)
        (self._job_dir / SUMMARY_NAME).unlink(missing_ok=True)
        configured_paths = {
            item.path.expanduser().resolve(strict=True)
            for item in [*job.config.tasks, *job.config.datasets]
            if item.path is not None
        }
        dataset_path = self._resolve_project_path(self._dataset_path)
        if dataset_path not in configured_paths:
            raise ValueError(
                "dataset_path must exactly match a local path configured on the Harbor Job"
            )
        batch_path = self._resolve_project_path(self._batch_path)
        stack_path = self._resolve_project_path(self._stack_path)
        expected_stack_path = (
            dataset_path.parent
            / "historical-evaluation-stack"
            / "evaluation-stack.yml"
        ).resolve(strict=True)
        if stack_path != expected_stack_path:
            raise ValueError(
                "Custom Historical Evaluation Stacks are not supported by the MVP; "
                "use the Stack materialized with this Dataset so the executed Evaluator "
                "matches the declared Evaluation Stack"
            )
        self._batch = load_generation_batch(batch_path, project_root=self._project_root)
        self._dataset_manifest = load_validated_dataset(
            dataset_path, project_root=self._project_root
        )
        self._stack_manifest = snapshot_stack(
            stack_path,
            project_root=self._project_root,
            job_kind=JOB_KIND,
        )
        self._context = build_historical_context(
            project_root=self._project_root,
            batch_path=batch_path,
            dataset_path=dataset_path,
            stack_path=stack_path,
            mode=self._mode,
        )
        doctor = {
            "schema_version": 1,
            "job_kind": JOB_KIND,
            "valid": True,
            "promotion_ready": False,
            "mode": "diagnostic",
            "findings": [
                {
                    "level": "info",
                    "code": "HISTORICAL_EVALUATION_DIAGNOSTIC_ONLY",
                    "message": "Frozen Generation Records are evaluated without Candidate execution and cannot enter Promotion Gate.",
                }
            ],
        }
        artifacts = {
            BATCH_MANIFEST_NAME: self._batch.manifest,
            DATASET_MANIFEST_NAME: self._dataset_manifest,
            DATASET_PREVIEW_NAME: build_dataset_preview(
                dataset_path, self._dataset_manifest
            ),
            STACK_MANIFEST_NAME: self._stack_manifest,
            STACK_SOURCES_NAME: snapshot_stack_sources(
                self._stack_manifest, project_root=self._project_root
            ),
            CONTEXT_NAME: self._context,
            "architecture-doctor.json": doctor,
        }
        for name, value in artifacts.items():
            (self._job_dir / name).write_text(
                json.dumps(value, ensure_ascii=False, indent=2) + "\n"
            )
        self._events_path = self._job_dir / "historical-events.jsonl"
        self._lifecycle = TrialLifecycleStore(
            self._job_dir,
            job=self._job_dir.name,
            tasks=self._dataset_manifest["tasks"],
            job_kind=JOB_KIND,
        )
        self._lifecycle.initialize()
        job.on_trial_started(self._on_trial_started)
        job.on_environment_started(self._on_environment_started)
        job.on_agent_started(self._on_agent_started)
        job.on_agent_ended(self._on_agent_ended)
        job.on_verification_started(self._on_verification_started)
        job.on_trial_ended(self._on_trial_ended)
        job.on_trial_cancelled(self._on_trial_cancelled)

    async def _on_trial_started(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(event, "preparing-environment")

    async def _on_environment_started(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(event, "loading-observation")

    async def _on_agent_started(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(event, "preparing-agent")
            self._lifecycle.transition(event, "running-adapter")

    async def _on_agent_ended(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(event, "rendering")

    async def _on_verification_started(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(event, "evaluating")

    async def _on_trial_ended(self, event: TrialHookEvent) -> None:
        phase = terminal_phase(event.result)
        if self._lifecycle:
            self._lifecycle.transition(event, phase, terminal=True)
        if self._events_path is not None:
            result = event.result
            with self._events_path.open("a") as output:
                output.write(
                    json.dumps(
                        {
                            "schema_version": 1,
                            "job_kind": JOB_KIND,
                            "event": "trial_ended",
                            "trial_id": str(result.id),
                            "trial_name": result.trial_name,
                            "phase": phase,
                            "exception": (
                                result.exception_info.exception_type
                                if result.exception_info is not None
                                else None
                            ),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )

    async def _on_trial_cancelled(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(event, "cancelled", terminal=True)

    @override
    async def on_job_end(self, job_result: JobResult) -> None:
        if (
            self._job_dir is None
            or self._dataset_manifest is None
            or self._stack_manifest is None
            or self._context is None
        ):
            return
        payloads = [result.model_dump(mode="json") for result in job_result.trial_results]
        validation = write_historical_job_artifacts(
            self._job_dir,
            payloads,
            dataset_manifest=self._dataset_manifest,
            stack_manifest=self._stack_manifest,
        )
        assessments = load_historical_assessments(self._job_dir)
        if self._lifecycle:
            for assessment in assessments:
                self._lifecycle.finalize_score(
                    str(assessment["trial_id"]),
                    phase=str(assessment["status"]),
                    score=dict(assessment["score"]),
                    task_name=str(assessment["dataset_trial"]),
                    trial_name=str(assessment["trial_name"]),
                )
        summary = summarize_historical_payloads(
            payloads,
            job_name=self._job_dir.name,
            evaluation_context=self._context,
            artifact_validation=validation,
            dataset_manifest=self._dataset_manifest,
            assessments=assessments,
        )
        write_summary(self._job_dir, summary)
        if not validation["valid"]:
            raise ValueError("Historical Evaluation artifacts failed validation")
        _atomic_json(
            self._job_dir / COMPLETION_SENTINEL,
            {
                "schema_version": 1,
                "job_kind": JOB_KIND,
                "status": "completed",
                "valid": True,
                "job": self._job_dir.name,
                "summary_path": "evaluation-summary.json",
                "artifact_registry_path": "artifact-registry.json",
                "coverage": summary["coverage"],
                "evaluator_meta_evaluation": {
                    "status": "not-run",
                    "validation_report_ref": None,
                },
            },
        )
