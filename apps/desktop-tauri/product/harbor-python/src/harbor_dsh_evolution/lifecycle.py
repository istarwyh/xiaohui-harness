from __future__ import annotations

import json
import os
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any

LIFECYCLE_NAME = "trial-lifecycle.json"
EVENTS_NAME = "trial-events.jsonl"

ACTIVE_PHASES = (
    "queued",
    "preparing-environment",
    "preparing-agent",
    "loading-observation",
    "running-agent",
    "running-adapter",
    "running-integration",
    "rendering",
    "evaluating",
)
TERMINAL_PHASES = (
    "completed",
    "completed-unscored",
    "candidate-quality-failed",
    "infrastructure-error",
    "evaluation-error",
    "cancelled",
)


def _iso(value: Any = None) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat().replace("+00:00", "Z")
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_suffix(f"{path.suffix}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def terminal_phase(result: Any) -> str:
    """Classify execution independently from any numeric verifier reward."""
    exception = getattr(result, "exception_info", None)
    if exception is not None:
        return "infrastructure-error"
    if getattr(result, "verifier_result", None) is None:
        return "evaluation-error"
    return "completed"


def _task_aliases(task: dict[str, Any]) -> list[str]:
    """Return stable Harbor/Dataset aliases without depending on callback order."""
    metadata = task.get("metadata") if isinstance(task.get("metadata"), dict) else {}
    values = (task.get("id"), task.get("path"), metadata.get("task_name"))
    aliases: set[str] = set()
    for value in values:
        normalized = str(value or "").strip().strip("/")
        if not normalized or normalized == ".":
            continue
        aliases.add(normalized)
        aliases.add(normalized.rsplit("/", 1)[-1])
    return sorted(aliases)


def _event_aliases(task_name: str) -> set[str]:
    normalized = str(task_name).strip().strip("/")
    return {normalized, normalized.rsplit("/", 1)[-1]} if normalized else set()


class TrialLifecycleStore:
    """Append-only Trial events plus one small, atomic current-state snapshot."""

    def __init__(
        self,
        job_dir: Path,
        *,
        job: str,
        tasks: list[dict[str, Any]],
        job_kind: str = "candidate-evaluation",
    ):
        self.job_dir = job_dir
        self.job = job
        self.job_kind = job_kind
        self.events_path = job_dir / EVENTS_NAME
        self.snapshot_path = job_dir / LIFECYCLE_NAME
        self._lock = Lock()
        self._records = [
            {
                "dataset_order": index,
                "dataset_trial": str(task.get("id") or f"trial-{index + 1}"),
                "trial": str(task.get("id") or f"trial-{index + 1}"),
                "_task_aliases": _task_aliases(task),
                "execution_id": None,
                "trial_name": None,
                "phase": "queued",
                "terminal": False,
                "attempt": 1,
                "started_at": None,
                "updated_at": _iso(),
                "score": {"value": None, "valid": False, "invalid_reasons": ["not-evaluated"]},
            }
            for index, task in enumerate(tasks)
        ]

    def initialize(self) -> None:
        self.job_dir.mkdir(parents=True, exist_ok=True)
        with self._lock:
            for record in self._records:
                self._append_event(record, timestamp=record["updated_at"])
            self._write_snapshot()

    def _find(self, event: Any) -> dict[str, Any]:
        result = event.result
        execution_id = str(result.id)
        task_name = str(event.task_name)
        task_aliases = _event_aliases(task_name)
        for record in self._records:
            if record.get("execution_id") == execution_id:
                return record
        for record in self._records:
            if task_aliases.intersection(record.get("_task_aliases", ()) or ()) and not record.get("execution_id"):
                return record
        # A Harbor retry/repetition is a new immutable attempt, never an overwrite.
        previous = next(
            (
                item
                for item in reversed(self._records)
                if task_aliases.intersection(item.get("_task_aliases", ()) or ())
            ),
            None,
        )
        record = {
            "dataset_order": previous["dataset_order"] if previous else len(self._records),
            "dataset_trial": task_name,
            "trial": task_name,
            "_task_aliases": sorted(task_aliases),
            "execution_id": None,
            "trial_name": None,
            "phase": "queued",
            "terminal": False,
            "attempt": int(previous.get("attempt", 1)) + 1 if previous else 1,
            "started_at": None,
            "updated_at": _iso(event.timestamp),
            "score": {"value": None, "valid": False, "invalid_reasons": ["not-evaluated"]},
        }
        self._records.append(record)
        return record

    def transition(
        self,
        event: Any,
        phase: str,
        *,
        terminal: bool = False,
        score: dict[str, Any] | None = None,
    ) -> None:
        if phase not in (*ACTIVE_PHASES, *TERMINAL_PHASES):
            raise ValueError(f"Unsupported Trial phase: {phase}")
        with self._lock:
            record = self._find(event)
            result = event.result
            timestamp = _iso(event.timestamp)
            record.update(
                {
                    "execution_id": str(result.id),
                    "trial_name": str(result.trial_name),
                    "phase": phase,
                    "terminal": terminal,
                    "started_at": record.get("started_at") or timestamp,
                    "updated_at": timestamp,
                }
            )
            if score is not None:
                record["score"] = score
            self._append_event(record, timestamp=timestamp)
            self._write_snapshot()

    def finalize_score(
        self,
        execution_id: str,
        *,
        phase: str,
        score: dict[str, Any],
        task_name: str | None = None,
        trial_name: str | None = None,
    ) -> None:
        with self._lock:
            record = next(
                (item for item in self._records if item.get("execution_id") == execution_id),
                None,
            )
            if record is None and task_name:
                aliases = _event_aliases(task_name)
                record = next(
                    (
                        item
                        for item in self._records
                        if not item.get("execution_id")
                        and aliases.intersection(item.get("_task_aliases", ()) or ())
                    ),
                    None,
                )
            if record is None:
                return
            record.update(
                {
                    "execution_id": execution_id,
                    "trial_name": trial_name or record.get("trial_name"),
                    "phase": phase,
                    "terminal": True,
                    "score": score,
                    "started_at": record.get("started_at") or _iso(),
                    "updated_at": _iso(),
                }
            )
            self._append_event(record, timestamp=record["updated_at"])
            self._write_snapshot()

    def _append_event(self, record: dict[str, Any], *, timestamp: str) -> None:
        event = {
            "schema_version": 1,
            "job": self.job,
            "job_kind": self.job_kind,
            "trial": record["trial"],
            "execution_id": record.get("execution_id"),
            "trial_name": record.get("trial_name"),
            "dataset_order": record["dataset_order"],
            "phase": record["phase"],
            "terminal": record["terminal"],
            "started_at": record.get("started_at"),
            "updated_at": timestamp,
            "attempt": record["attempt"],
        }
        with self.events_path.open("a") as output:
            output.write(json.dumps(event, ensure_ascii=False) + "\n")

    def _write_snapshot(self) -> None:
        selected = sorted(
            self._records,
            key=lambda item: (item["dataset_order"], item["attempt"]),
        )
        latest: dict[int, dict[str, Any]] = {}
        for item in selected:
            latest[item["dataset_order"]] = item
        counts = Counter(item["phase"] for item in latest.values())
        attempt_counts = Counter(item["phase"] for item in selected)
        _atomic_json(
            self.snapshot_path,
            {
                "schema_version": 1,
                "job": self.job,
                "job_kind": self.job_kind,
                "updated_at": max((item["updated_at"] for item in selected), default=_iso()),
                "dataset_total": len({item["dataset_order"] for item in selected}),
                "attempt_count": len(selected),
                "counts": dict(sorted(counts.items())),
                "attempt_counts": dict(sorted(attempt_counts.items())),
                "selected_attempt_policy": "latest-attempt-per-dataset-item",
                "trials": [
                    {key: value for key, value in item.items() if not key.startswith("_")}
                    for item in selected
                ],
            },
        )
