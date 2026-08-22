from __future__ import annotations

import json
from pathlib import Path
from typing import override

from harbor.job import Job
from harbor.models.job.plugin import BaseJobPlugin
from harbor.models.job.result import JobResult
from harbor.trial.hooks import TrialHookEvent

from harbor_dsh_evolution.artifacts import write_job_artifacts
from harbor_dsh_evolution.candidate import CandidateManifest, verify_candidate
from harbor_dsh_evolution.context import CONTEXT_NAME, build_evaluation_context
from harbor_dsh_evolution.dataset import (
    MANIFEST_NAME as DATASET_MANIFEST_NAME,
    PREVIEW_NAME as DATASET_PREVIEW_NAME,
    build_dataset_preview,
    load_validated_dataset,
)
from harbor_dsh_evolution.doctor import architecture_doctor
from harbor_dsh_evolution.lifecycle import TrialLifecycleStore, terminal_phase
from harbor_dsh_evolution.stack import STACK_MANIFEST_NAME, snapshot_stack
from harbor_dsh_evolution.summary import summarize_payloads, write_summary


class EvolutionPlugin(BaseJobPlugin):
    """Bind a Harbor Job to strict Candidate, Dataset, and Evaluation Stack identities."""

    def __init__(
        self,
        *,
        candidate_manifest: str,
        stack_path: str,
        project_root: str,
        mode: str,
        dataset_path: str | None = None,
        policy_path: str | None = None,
    ):
        super().__init__()
        self._source_manifest = Path(candidate_manifest).expanduser().resolve(strict=True)
        self._manifest = CandidateManifest.from_dict(json.loads(self._source_manifest.read_text()))
        verified = verify_candidate(self._source_manifest.parent)
        if verified.digest != self._manifest.digest:
            raise ValueError("Candidate manifest does not match the immutable Candidate")
        self._project_root = Path(project_root).expanduser().resolve(strict=True)
        self._stack_path = Path(stack_path)
        self._mode = mode
        self._policy_path = Path(policy_path) if policy_path else None
        if mode not in {"diagnostic", "promotion-eligible"}:
            raise ValueError("mode must be diagnostic or promotion-eligible")
        if mode == "promotion-eligible" and self._policy_path is None:
            raise ValueError("promotion-eligible Jobs require policy_path")
        self._requested_dataset_path = Path(dataset_path) if dataset_path else None
        self._context: dict | None = None
        self._stack_manifest: dict | None = None
        self._job_dir: Path | None = None
        self._events_path: Path | None = None
        self._dataset_manifest: dict | None = None
        self._lifecycle: TrialLifecycleStore | None = None

    @override
    async def on_job_start(self, job: Job) -> None:
        configured_paths = {
            item.path.expanduser().resolve(strict=True)
            for item in [*job.config.tasks, *job.config.datasets]
            if item.path is not None
        }
        if self._requested_dataset_path is not None:
            dataset_path = self._requested_dataset_path.expanduser().resolve(strict=True)
            if dataset_path not in configured_paths:
                raise ValueError("dataset_path must exactly match a local path configured on the Harbor Job")
        elif len(configured_paths) == 1:
            dataset_path = next(iter(configured_paths))
        else:
            raise ValueError("EvolutionPlugin requires exactly one local Harbor dataset path")

        dataset_manifest = load_validated_dataset(dataset_path, project_root=self._project_root)
        self._dataset_manifest = dataset_manifest
        doctor = architecture_doctor(
            project_root=self._project_root,
            stack_path=self._stack_path,
            dataset_path=dataset_path,
            candidate_path=self._source_manifest.parent,
            policy_path=self._policy_path,
        )
        if self._mode == "promotion-eligible" and not doctor["promotion_ready"]:
            codes = ", ".join(item["code"] for item in doctor["findings"] if item["level"] == "error")
            raise ValueError(f"Architecture Doctor blocked promotion-eligible Job: {codes}")
        self._stack_manifest = snapshot_stack(self._stack_path, project_root=self._project_root)
        self._context = build_evaluation_context(
            dataset_path,
            candidate=self._manifest,
            stack_path=self._stack_path,
            project_root=self._project_root,
            mode=self._mode,
        )
        self._job_dir = job.job_dir
        self._job_dir.mkdir(parents=True, exist_ok=True)
        artifacts = {
            "candidate-manifest.json": self._manifest.to_dict(),
            DATASET_MANIFEST_NAME: dataset_manifest,
            DATASET_PREVIEW_NAME: build_dataset_preview(dataset_path, dataset_manifest),
            STACK_MANIFEST_NAME: self._stack_manifest,
            CONTEXT_NAME: self._context,
            "architecture-doctor.json": doctor,
        }
        for name, value in artifacts.items():
            (self._job_dir / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        self._events_path = self._job_dir / "candidate-events.jsonl"
        self._lifecycle = TrialLifecycleStore(
            self._job_dir,
            job=self._job_dir.name,
            tasks=dataset_manifest["tasks"],
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
            self._lifecycle.transition(event, "preparing-environment")

    async def _on_agent_started(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(event, "preparing-agent")
            self._lifecycle.transition(event, "running-agent")

    async def _on_agent_ended(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(event, "running-integration")

    async def _on_verification_started(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(event, "rendering")
            self._lifecycle.transition(event, "evaluating")

    async def _on_trial_ended(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(
                event,
                terminal_phase(event.result),
                terminal=True,
            )
        if self._events_path is None:
            return
        result = event.result
        rewards = result.verifier_result.rewards if result.verifier_result is not None else None
        record = {
            "event": "trial_ended",
            "trial_id": str(result.id),
            "trial_name": result.trial_name,
            "candidate_digest": self._manifest.digest,
            "rewards": rewards,
            "exception": result.exception_info.exception_type if result.exception_info is not None else None,
        }
        with self._events_path.open("a") as output:
            output.write(json.dumps(record, ensure_ascii=False) + "\n")

    async def _on_trial_cancelled(self, event: TrialHookEvent) -> None:
        if self._lifecycle:
            self._lifecycle.transition(event, "cancelled", terminal=True)

    @override
    async def on_job_end(self, job_result: JobResult) -> None:
        if (
            self._job_dir is None
            or self._context is None
            or self._stack_manifest is None
            or self._dataset_manifest is None
        ):
            return
        payloads = [result.model_dump(mode="json") for result in job_result.trial_results]
        validation = write_job_artifacts(
            self._job_dir,
            payloads,
            evaluation_contract=self._stack_manifest["evaluation_contract"],
            dataset_manifest=self._dataset_manifest,
            stack_manifest=self._stack_manifest,
        )
        summary = summarize_payloads(
            payloads,
            job_name=self._job_dir.name,
            candidate=self._manifest.to_dict(),
            evaluation_context=self._context,
            artifact_validation=validation,
            evaluation_contract=self._stack_manifest["evaluation_contract"],
            dataset_manifest=self._dataset_manifest,
        )
        write_summary(self._job_dir, summary)
        if self._lifecycle:
            for trial in summary["trials"]:
                self._lifecycle.finalize_score(
                    trial["id"],
                    phase=trial["status"],
                    score=trial["score"],
                )
