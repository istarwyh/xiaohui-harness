from __future__ import annotations

import json
import tomllib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from harbor_dsh_evolution.identity import public_relative, resolve_inside, tree_digest

MANIFEST_NAME = "dataset-manifest.json"
PREVIEW_NAME = "dataset-preview.json"
MAX_INSTRUCTION_CHARS = 128_000


@dataclass(frozen=True)
class DatasetValidation:
    valid: bool
    manifest: dict[str, Any] | None
    findings: list[dict[str, str]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "manifest": self.manifest,
            "findings": self.findings,
        }


def compute_dataset_digest(dataset_dir: Path) -> tuple[str, list[dict[str, Any]]]:
    return tree_digest(
        dataset_dir,
        namespace="harbor-dsh-dataset-v2",
        excluded={MANIFEST_NAME},
    )


def _discover_tasks(dataset_dir: Path) -> list[dict[str, Any]]:
    task_files = sorted(dataset_dir.rglob("task.toml"))
    if not task_files and (dataset_dir / "instruction.md").is_file():
        task_files = [dataset_dir / "task.toml"]
    tasks: list[dict[str, Any]] = []
    for index, task_file in enumerate(task_files):
        root = task_file.parent
        relative = root.relative_to(dataset_dir).as_posix() or "."
        instruction = root / "instruction.md"
        try:
            configuration = tomllib.loads(task_file.read_text())
        except (OSError, tomllib.TOMLDecodeError):
            configuration = {}
        metadata = configuration.get("metadata") if isinstance(configuration.get("metadata"), dict) else {}
        task = {
            "id": relative if relative != "." else f"task-{index + 1}",
            "path": relative,
            "instruction": public_relative(dataset_dir, instruction)
            if instruction.is_file()
            else f"{relative}/instruction.md".lstrip("./"),
            "metadata": metadata,
        }
        if isinstance(metadata.get("query"), str) and metadata["query"].strip():
            task["query"] = metadata["query"].strip()
        verifier = root / "tests" / "test.sh"
        environment = root / "environment" / "Dockerfile"
        if verifier.is_file():
            task["verifier"] = public_relative(dataset_dir, verifier)
        if environment.is_file():
            task["environment"] = public_relative(dataset_dir, environment)
        tasks.append(task)
    return tasks


def snapshot_dataset(
    dataset_dir: Path,
    *,
    dataset_id: str | None = None,
    version: str = "1.0.0",
) -> dict[str, Any]:
    dataset_dir = dataset_dir.expanduser().resolve(strict=True)
    digest, files = compute_dataset_digest(dataset_dir)
    tasks = _discover_tasks(dataset_dir)
    if not tasks:
        raise ValueError("Dataset has no Harbor tasks (task.toml)")
    manifest = {
        "schema_version": 1,
        "dataset_id": dataset_id or dataset_dir.name,
        "version": version,
        "source_digest": digest,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "task_count": len(tasks),
        "tasks": tasks,
        "file_count": len(files),
    }
    (dataset_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    return manifest


def validate_dataset(dataset_dir: Path, *, project_root: Path | None = None) -> DatasetValidation:
    dataset_dir = dataset_dir.expanduser().resolve(strict=True)
    findings: list[dict[str, str]] = []
    manifest_path = dataset_dir / MANIFEST_NAME
    if not manifest_path.is_file():
        return DatasetValidation(
            False,
            None,
            [{"level": "error", "code": "DATASET_MANIFEST_MISSING", "message": f"{MANIFEST_NAME} is required"}],
        )
    try:
        manifest = json.loads(manifest_path.read_text())
    except json.JSONDecodeError:
        return DatasetValidation(
            False,
            None,
            [{"level": "error", "code": "DATASET_MANIFEST_INVALID", "message": "dataset-manifest.json is not valid JSON"}],
        )

    def error(code: str, message: str) -> None:
        findings.append({"level": "error", "code": code, "message": message})

    if manifest.get("schema_version") != 1:
        error("DATASET_SCHEMA_UNSUPPORTED", "Dataset manifest must use schema_version 1")
    for key in ("dataset_id", "version", "source_digest"):
        if not isinstance(manifest.get(key), str) or not manifest[key].strip():
            error("DATASET_IDENTITY_INVALID", f"Dataset manifest requires non-empty {key}")
    tasks = manifest.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        error("DATASET_TASKS_MISSING", "Dataset manifest requires at least one task")
        tasks = []
    if manifest.get("task_count") != len(tasks):
        error("DATASET_TASK_COUNT_MISMATCH", "task_count does not match tasks")

    task_ids: set[str] = set()
    queries: set[str] = set()
    for index, task in enumerate(tasks):
        if not isinstance(task, dict):
            error("DATASET_TASK_INVALID", f"Task {index} must be an object")
            continue
        task_id = str(task.get("id") or "")
        if not task_id:
            error("DATASET_TASK_ID_MISSING", f"Task {index} has no id")
        elif task_id in task_ids:
            error("DATASET_TASK_ID_DUPLICATE", f"Duplicate task id: {task_id}")
        task_ids.add(task_id)
        query = task.get("query")
        if isinstance(query, str) and query.strip():
            normalized = " ".join(query.split()).casefold()
            if normalized in queries:
                error("DATASET_QUERY_DUPLICATE", f"Duplicate query in task: {task_id}")
            queries.add(normalized)
        for key in ("path", "instruction", "verifier", "environment"):
            value = task.get(key)
            if value is None and key in {"verifier", "environment"}:
                continue
            if not isinstance(value, str) or not value:
                error("DATASET_TASK_PATH_MISSING", f"Task {task_id or index} requires {key}")
                continue
            try:
                resolved = resolve_inside(dataset_dir, value, label=f"task.{key}")
                if key == "instruction" and (not resolved.is_file() or not resolved.read_text().strip()):
                    error("DATASET_INSTRUCTION_EMPTY", f"Task {task_id or index} instruction is empty")
            except (FileNotFoundError, ValueError):
                error("DATASET_TASK_PATH_INVALID", f"Task {task_id or index} {key} is missing or outside the dataset")
        metadata = task.get("metadata") or {}
        if isinstance(metadata, dict):
            forbidden = {"authorization", "cookie", "token", "api_key", "secret"}
            leaked = forbidden.intersection(key.casefold() for key in metadata)
            if leaked:
                error("DATASET_SENSITIVE_FIELD", f"Task {task_id or index} metadata contains sensitive fields")

    actual_digest, files = compute_dataset_digest(dataset_dir)
    if manifest.get("source_digest") != actual_digest:
        error("DATASET_SOURCE_DIGEST_MISMATCH", "Dataset files changed after the manifest was created")
    if manifest.get("file_count") != len(files):
        error("DATASET_FILE_COUNT_MISMATCH", "file_count does not match dataset files")
    if project_root is not None:
        try:
            resolve_inside(project_root, dataset_dir, label="dataset")
        except ValueError:
            error("DATASET_OUTSIDE_PROJECT", "Dataset must stay under the project root")
    return DatasetValidation(not any(item["level"] == "error" for item in findings), manifest, findings)


def load_validated_dataset(dataset_dir: Path, *, project_root: Path | None = None) -> dict[str, Any]:
    result = validate_dataset(dataset_dir, project_root=project_root)
    if not result.valid:
        codes = ", ".join(item["code"] for item in result.findings)
        raise ValueError(f"Dataset validation failed: {codes}")
    assert result.manifest is not None
    return result.manifest


def build_dataset_preview(dataset_dir: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    """Snapshot Agent-visible instructions for a human-readable Job view.

    Verifier code and hidden GT stay out of this artifact. The preview contains
    only the instruction that the evaluated Agent received plus public task
    identity fields already present in the Dataset Manifest.
    """
    dataset_dir = dataset_dir.expanduser().resolve(strict=True)
    tasks: list[dict[str, Any]] = []
    for task in manifest.get("tasks") or []:
        if not isinstance(task, dict):
            continue
        instruction_file = resolve_inside(
            dataset_dir,
            str(task.get("instruction") or ""),
            label="task.instruction",
        )
        instruction = instruction_file.read_text()
        truncated = len(instruction) > MAX_INSTRUCTION_CHARS
        tasks.append(
            {
                "id": str(task.get("id") or "unknown"),
                "path": str(task.get("path") or "."),
                "instruction_file": str(task.get("instruction") or ""),
                "instruction": instruction[:MAX_INSTRUCTION_CHARS],
                "instruction_truncated": truncated,
                "query": str(task.get("query") or ""),
                "metadata": task.get("metadata") if isinstance(task.get("metadata"), dict) else {},
            }
        )
    return {
        "schema_version": 1,
        "dataset_id": manifest.get("dataset_id"),
        "version": manifest.get("version"),
        "source_digest": manifest.get("source_digest"),
        "task_count": len(tasks),
        "tasks": tasks,
    }
