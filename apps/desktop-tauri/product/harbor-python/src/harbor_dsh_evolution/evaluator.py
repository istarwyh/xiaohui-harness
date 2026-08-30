from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any, Protocol

import yaml
from jsonschema import Draft202012Validator

from harbor_dsh_evolution.identity import canonical_digest, public_relative, resolve_inside

EVALUATOR_INTERFACE = "harbor-dsh-evaluator/v1"
EVALUATION_INPUT = "evaluation-input/v1"
EVALUATION_RESULT = "evaluation-result/v1"
EVALUATOR_INTERFACE_V2 = "harbor-dsh-evaluator/v2"
EVALUATION_INPUT_V2 = "evaluation-input/v2"
EVALUATION_RESULT_V2 = "evaluation-result/v2"
TERNARY_VALUES = (0, 0.5, 1)
CRITERION_STATUSES = ("scored", "not-applicable", "insufficient-evidence", "evaluation-error")
MAX_EDIT_BYTES = 128 * 1024
IDENTITY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$")

_DESCRIPTOR_SCHEMA = {
    "type": "object",
    "required": [
        "schema_version",
        "interface",
        "evaluator_id",
        "version",
        "kind",
        "protocol",
        "implementation",
        "editable_files",
        "criteria",
        "aggregate",
    ],
    "properties": {
        "schema_version": {"const": 1},
        "interface": {"const": EVALUATOR_INTERFACE},
        "evaluator_id": {"type": "string", "minLength": 1},
        "version": {"type": "string", "minLength": 1},
        "kind": {"enum": ["script", "llm-as-judge"]},
        "protocol": {
            "type": "object",
            "required": ["input", "output"],
            "properties": {
                "input": {"const": EVALUATION_INPUT},
                "output": {"const": EVALUATION_RESULT},
            },
        },
        "implementation": {
            "type": "object",
            "required": ["entry", "language", "callable"],
        },
        "editable_files": {"type": "array", "minItems": 1},
        "criteria": {"type": "array", "minItems": 1},
        "aggregate": {
            "type": "object",
            "required": ["metric_id", "method"],
            "properties": {"method": {"const": "mean"}},
        },
    },
}

_DESCRIPTOR_SCHEMA_V2 = {
    **_DESCRIPTOR_SCHEMA,
    "properties": {
        **_DESCRIPTOR_SCHEMA["properties"],
        "schema_version": {"const": 2},
        "interface": {"const": EVALUATOR_INTERFACE_V2},
        "protocol": {
            "type": "object",
            "required": ["input", "output"],
            "properties": {
                "input": {"const": EVALUATION_INPUT_V2},
                "output": {"const": EVALUATION_RESULT_V2},
            },
        },
        "criteria": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {"required": {"type": "boolean"}},
            },
        },
        "aggregate": {
            "type": "object",
            "required": ["metric_id", "method"],
            "properties": {
                "metric_id": {"type": "string", "minLength": 1},
                "method": {"const": "mean"},
                "minimum_coverage": {"type": "number", "minimum": 0, "maximum": 1},
            },
        },
    },
}


class Evaluator(Protocol):
    """The implementation contract shared by script and LLM-as-Judge evaluators."""

    def evaluate(self, payload: dict[str, Any]) -> dict[str, Any]: ...


def _sha256(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode()).hexdigest()


def _read_safe(path: Path, *, max_bytes: int = MAX_EDIT_BYTES) -> str:
    details = path.lstat()
    if details.st_size > max_bytes:
        raise ValueError(f"Evaluator file exceeds {max_bytes} bytes: {path.name}")
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Evaluator file is not a regular file: {path.name}")
    return path.read_text()


def _descriptor_path(path: Path, project_root: Path) -> Path:
    resolved = resolve_inside(project_root, path, label="evaluator descriptor")
    if resolved.suffix.casefold() != ".json":
        raise ValueError("Evaluator component entry must be a JSON descriptor")
    return resolved


def load_evaluator_descriptor(
    path: Path,
    *,
    project_root: Path,
    expected_id: str | None = None,
    expected_version: str | None = None,
) -> dict[str, Any]:
    project_root = project_root.expanduser().resolve(strict=True)
    descriptor_path = _descriptor_path(path, project_root)
    descriptor_text = _read_safe(descriptor_path)
    try:
        descriptor = json.loads(descriptor_text)
    except json.JSONDecodeError as error:
        raise ValueError(f"Evaluator descriptor is invalid JSON: {error.msg}") from error
    is_v2 = isinstance(descriptor, dict) and (
        descriptor.get("schema_version") == 2 or descriptor.get("interface") == EVALUATOR_INTERFACE_V2
    )
    descriptor_schema = _DESCRIPTOR_SCHEMA_V2 if is_v2 else _DESCRIPTOR_SCHEMA
    errors = sorted(Draft202012Validator(descriptor_schema).iter_errors(descriptor), key=lambda item: list(item.path))
    if errors:
        raise ValueError("Evaluator descriptor is invalid: " + "; ".join(error.message for error in errors))
    if expected_id and descriptor["evaluator_id"] != expected_id:
        raise ValueError("Evaluator descriptor id does not match Evaluation Stack")
    if expected_version and descriptor["version"] != expected_version:
        raise ValueError("Evaluator descriptor version does not match Evaluation Stack")

    criteria: list[dict[str, Any]] = []
    criterion_ids: set[str] = set()
    for item in descriptor["criteria"]:
        if not isinstance(item, dict):
            raise ValueError("Evaluator criteria must be objects")
        identity = str(item.get("id") or "").strip()
        label = str(item.get("label") or "").strip()
        if not identity or not label or identity in criterion_ids:
            raise ValueError("Evaluator criteria require unique id and non-empty label")
        if item.get("values") != list(TERNARY_VALUES):
            raise ValueError(f"Evaluator criterion {identity} must use [0, 0.5, 1]")
        criterion_ids.add(identity)
        criterion = {"id": identity, "label": label, "values": list(TERNARY_VALUES)}
        if is_v2:
            criterion["required"] = item.get("required", False)
        criteria.append(criterion)

    editable: list[dict[str, Any]] = []
    editable_paths: set[Path] = set()
    for item in descriptor["editable_files"]:
        if not isinstance(item, dict):
            raise ValueError("Evaluator editable_files must contain objects")
        relative = str(item.get("path") or "").strip()
        role = str(item.get("role") or "").strip()
        language = str(item.get("language") or "").strip()
        affects = item.get("affects")
        if role not in {"implementation", "prompt", "rubric", "config"} or not language:
            raise ValueError("Evaluator editable file requires a supported role and language")
        if not isinstance(affects, list) or not affects or not set(affects) <= {"evaluator", "rubric"}:
            raise ValueError("Evaluator editable file affects must contain evaluator and/or rubric")
        file_path = resolve_inside(project_root, descriptor_path.parent / relative, label="evaluator editable file")
        if file_path != descriptor_path.parent and descriptor_path.parent not in file_path.parents:
            raise ValueError("Evaluator editable files must stay inside the versioned bundle directory")
        if file_path in editable_paths:
            raise ValueError("Evaluator editable file paths must be unique")
        text = _read_safe(file_path)
        editable_paths.add(file_path)
        editable.append(
            {
                "path": public_relative(project_root, file_path),
                "relative_path": relative,
                "role": role,
                "language": language,
                "affects": list(dict.fromkeys(affects)),
                "digest": _sha256(text),
                "size": len(text.encode()),
            }
        )

    implementation = descriptor["implementation"]
    implementation_path = resolve_inside(
        project_root,
        descriptor_path.parent / str(implementation.get("entry") or ""),
        label="evaluator implementation",
    )
    if implementation_path not in editable_paths:
        raise ValueError("Evaluator implementation entry must be listed in editable_files")
    if descriptor["kind"] == "llm-as-judge" and not isinstance(descriptor.get("judge"), dict):
        raise ValueError("LLM-as-Judge evaluator requires non-secret judge configuration")

    aggregate = dict(descriptor["aggregate"])
    if is_v2:
        aggregate.setdefault("minimum_coverage", 0)
    bundle = {
        "schema_version": descriptor["schema_version"],
        "interface": descriptor["interface"],
        "evaluator_id": descriptor["evaluator_id"],
        "version": descriptor["version"],
        "kind": descriptor["kind"],
        "protocol": descriptor["protocol"],
        "implementation": {
            **implementation,
            "path": public_relative(project_root, implementation_path),
        },
        "editable_files": editable,
        "criteria": criteria,
        "aggregate": aggregate,
        "judge": descriptor.get("judge"),
        "descriptor_path": public_relative(project_root, descriptor_path),
    }
    bundle["digest"] = canonical_digest(
        {
            "descriptor": descriptor,
            "files": [
                {"path": item["path"], "content": _read_safe(project_root / item["path"])}
                for item in editable
            ],
        },
        namespace=f"harbor-dsh-evaluator-interface-v{descriptor['schema_version']}",
    )
    return bundle


def _validate_evaluation_result_v1(
    result: dict[str, Any], *, criteria: list[dict[str, Any]]
) -> dict[str, Any]:
    if result.get("schema_version") != 1 or result.get("protocol") != EVALUATION_RESULT:
        raise ValueError("Evaluator result must use evaluation-result/v1")
    expected = {item["id"] for item in criteria}
    received: dict[str, float] = {}
    details: dict[str, dict[str, Any]] = {}
    for item in result.get("criteria") or []:
        if not isinstance(item, dict) or item.get("id") in received:
            raise ValueError("Evaluator result criteria must have unique ids")
        identity = str(item.get("id") or "").strip()
        if not identity:
            raise ValueError("Evaluator result criteria require non-empty ids")
        score = item.get("score")
        if score not in TERNARY_VALUES:
            raise ValueError("Evaluator criterion scores must be 0, 0.5, or 1")
        reason = str(item.get("reason") or "").strip()
        recommendation = str(item.get("recommendation") or "").strip()
        if not reason:
            raise ValueError(f"Evaluator criterion {identity} requires a non-empty reason")
        if not recommendation:
            raise ValueError(f"Evaluator criterion {identity} requires a non-empty recommendation")
        evidence_refs = item.get("evidence_refs") or []
        if not isinstance(evidence_refs, list) or not all(isinstance(value, str) for value in evidence_refs):
            raise ValueError(f"Evaluator criterion {identity} evidence_refs must be strings")
        received[identity] = float(score)
        details[identity] = {
            "score": float(score),
            "reason": reason,
            "recommendation": recommendation,
            "evidence_refs": evidence_refs,
        }
    if set(received) != expected:
        raise ValueError("Evaluator result criteria do not match the descriptor")
    aggregate = sum(received.values()) / len(received)
    return {"criteria": received, "details": details, "reward": round(aggregate, 6)}


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _rounded_number_matches(value: Any, expected: float) -> bool:
    return _finite_number(value) and round(float(value), 6) == expected


def _validate_evaluation_result_v2(
    result: dict[str, Any],
    *,
    criteria: list[dict[str, Any]],
    aggregate_config: dict[str, Any] | None,
) -> dict[str, Any]:
    if result.get("schema_version") != 2 or result.get("protocol") != EVALUATION_RESULT_V2:
        raise ValueError("Evaluator result must use evaluation-result/v2")

    expected: dict[str, dict[str, Any]] = {}
    for criterion in criteria:
        if not isinstance(criterion, dict):
            raise ValueError("Evaluator descriptor criteria must be objects")
        identity = str(criterion.get("id") or "").strip()
        if not identity or identity in expected:
            raise ValueError("Evaluator descriptor criteria require unique non-empty ids")
        required = criterion.get("required", False)
        if not isinstance(required, bool):
            raise ValueError(f"Evaluator criterion {identity} required must be a boolean")
        expected[identity] = {**criterion, "required": required}
    if not expected:
        raise ValueError("Evaluator descriptor requires at least one criterion")

    if aggregate_config is None:
        aggregate_config = {"metric_id": "reward", "method": "mean", "minimum_coverage": 0}
    if not isinstance(aggregate_config, dict):
        raise ValueError("Evaluator aggregate configuration must be an object")
    metric_id = str(aggregate_config.get("metric_id") or "").strip()
    if not metric_id:
        raise ValueError("Evaluator aggregate configuration requires metric_id")
    if aggregate_config.get("method") != "mean":
        raise ValueError("Evaluator aggregate method must be mean")
    minimum_coverage = aggregate_config.get("minimum_coverage", 0)
    if not _finite_number(minimum_coverage) or not 0 <= float(minimum_coverage) <= 1:
        raise ValueError("Evaluator aggregate minimum_coverage must be between 0 and 1")
    minimum_coverage = float(minimum_coverage)

    result_criteria = result.get("criteria")
    if not isinstance(result_criteria, list):
        raise ValueError("Evaluator result criteria must be an array")
    received: dict[str, float | None] = {}
    details: dict[str, dict[str, Any]] = {}
    status_counts = {status: 0 for status in CRITERION_STATUSES}
    for item in result_criteria:
        if not isinstance(item, dict):
            raise ValueError("Evaluator result criteria must be objects")
        identity = str(item.get("id") or "").strip()
        if not identity:
            raise ValueError("Evaluator result criteria require non-empty ids")
        if identity in received:
            raise ValueError("Evaluator result criteria must have unique ids")
        status = item.get("status")
        if status not in CRITERION_STATUSES:
            raise ValueError(f"Evaluator criterion {identity} has an unsupported status")
        if "score" not in item:
            raise ValueError(f"Evaluator criterion {identity} requires score")
        score = item.get("score")
        if status == "scored":
            if not _finite_number(score) or score not in TERNARY_VALUES:
                raise ValueError(f"Evaluator criterion {identity} scored status requires score 0, 0.5, or 1")
            normalized_score: float | None = float(score)
        else:
            if score is not None:
                raise ValueError(f"Evaluator criterion {identity} {status} status requires score null")
            normalized_score = None
        reason = str(item.get("reason") or "").strip()
        recommendation = str(item.get("recommendation") or "").strip()
        if not reason:
            raise ValueError(f"Evaluator criterion {identity} requires a non-empty reason")
        if not recommendation:
            raise ValueError(f"Evaluator criterion {identity} requires a non-empty recommendation")
        if "evidence_refs" not in item:
            raise ValueError(f"Evaluator criterion {identity} requires evidence_refs")
        evidence_refs = item["evidence_refs"]
        if not isinstance(evidence_refs, list) or not all(
            isinstance(value, str) and value.strip() for value in evidence_refs
        ):
            raise ValueError(f"Evaluator criterion {identity} evidence_refs must be non-empty strings")
        received[identity] = normalized_score
        status_counts[status] += 1
        details[identity] = {
            "status": status,
            "score": normalized_score,
            "reason": reason,
            "recommendation": recommendation,
            "evidence_refs": evidence_refs,
            "required": expected.get(identity, {}).get("required", False),
        }
    if set(received) != set(expected):
        raise ValueError("Evaluator result criteria do not match the descriptor")

    scored = [score for score in received.values() if score is not None]
    scored_criteria = len(scored)
    total_criteria = len(expected)
    coverage = round(scored_criteria / total_criteria, 6)
    aggregate_value = round(sum(scored) / scored_criteria, 6) if scored else None
    reported_aggregate = result.get("aggregate")
    if not isinstance(reported_aggregate, dict):
        raise ValueError("Evaluator result v2 requires an aggregate object")
    if reported_aggregate.get("metric_id") != metric_id:
        raise ValueError("Evaluator result aggregate metric_id does not match the descriptor")
    reported_scored = reported_aggregate.get("scored_criteria")
    if not isinstance(reported_scored, int) or isinstance(reported_scored, bool) or reported_scored != scored_criteria:
        raise ValueError("Evaluator result aggregate scored_criteria does not match the criteria")
    reported_total = reported_aggregate.get("total_criteria")
    if not isinstance(reported_total, int) or isinstance(reported_total, bool) or reported_total != total_criteria:
        raise ValueError("Evaluator result aggregate total_criteria does not match the descriptor")
    if not _rounded_number_matches(reported_aggregate.get("coverage"), coverage):
        raise ValueError("Evaluator result aggregate coverage does not match the criteria")
    reported_value = reported_aggregate.get("value")
    if aggregate_value is None:
        if reported_value is not None:
            raise ValueError("Evaluator result aggregate value must be null when no criteria are scored")
    elif not _rounded_number_matches(reported_value, aggregate_value):
        raise ValueError("Evaluator result aggregate value does not match the scored criteria")

    required_criteria_scored = all(
        details[identity]["status"] == "scored"
        for identity, criterion in expected.items()
        if criterion["required"]
    )
    coverage_satisfied = coverage >= minimum_coverage
    score_valid = (
        aggregate_value is not None
        and required_criteria_scored
        and coverage_satisfied
        and status_counts["evaluation-error"] == 0
    )
    normalized_aggregate = {
        "metric_id": metric_id,
        "value": aggregate_value,
        "scored_criteria": scored_criteria,
        "total_criteria": total_criteria,
        "coverage": coverage,
    }
    return {
        "criteria": received,
        "details": details,
        "reward": aggregate_value if score_valid else None,
        "aggregate": normalized_aggregate,
        "coverage": coverage,
        "minimum_coverage": minimum_coverage,
        "coverage_satisfied": coverage_satisfied,
        "required_criteria_scored": required_criteria_scored,
        "criterion_status_counts": status_counts,
        "score_valid": score_valid,
    }


def validate_evaluation_result(
    result: dict[str, Any],
    *,
    criteria: list[dict[str, Any]],
    aggregate: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if result.get("schema_version") == 2 or result.get("protocol") == EVALUATION_RESULT_V2:
        return _validate_evaluation_result_v2(
            result,
            criteria=criteria,
            aggregate_config=aggregate,
        )
    return _validate_evaluation_result_v1(result, criteria=criteria)


def inspect_evaluator(*, project_root: Path, stack_path: Path, include_source: bool = True) -> dict[str, Any]:
    project_root = project_root.expanduser().resolve(strict=True)
    stack_path = resolve_inside(project_root, stack_path, label="stack")
    stack = yaml.safe_load(_read_safe(stack_path))
    component = (stack.get("components") or {}).get("evaluator") or {}
    bundle = load_evaluator_descriptor(
        Path(str(component.get("entry") or "")),
        project_root=project_root,
        expected_id=str(component.get("id") or ""),
        expected_version=str(component.get("version") or ""),
    )
    if include_source:
        for item in bundle["editable_files"]:
            item["text"] = _read_safe(project_root / item["path"])
    return {
        "schema_version": 1,
        "stack": {
            "path": public_relative(project_root, stack_path),
            "id": stack.get("stack_id"),
            "version": stack.get("version"),
        },
        "evaluator": bundle,
    }


def _atomic_write(path: Path, text: str) -> None:
    descriptor = path.lstat()
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Refusing to replace unsafe file: {path.name}")
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.hse-", dir=path.parent)
    try:
        with os.fdopen(handle, "w") as stream:
            stream.write(text)
        os.chmod(temporary, descriptor.st_mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def update_evaluator_source(
    *,
    project_root: Path,
    stack_path: Path,
    file_path: str,
    content: str,
    expected_digest: str,
    new_evaluator_version: str,
    new_stack_version: str,
) -> dict[str, Any]:
    if len(content.encode()) > MAX_EDIT_BYTES:
        raise ValueError(f"Evaluator source exceeds {MAX_EDIT_BYTES} bytes")
    if not IDENTITY.fullmatch(new_evaluator_version) or not IDENTITY.fullmatch(new_stack_version):
        raise ValueError("Evaluator and Stack versions must be non-empty release identities")
    project_root = project_root.expanduser().resolve(strict=True)
    stack_path = resolve_inside(project_root, stack_path, label="stack")
    stack_text = _read_safe(stack_path)
    stack = yaml.safe_load(stack_text)
    component = (stack.get("components") or {}).get("evaluator") or {}
    descriptor_path = _descriptor_path(Path(str(component.get("entry") or "")), project_root)
    descriptor_text = _read_safe(descriptor_path)
    descriptor = json.loads(descriptor_text)
    current = load_evaluator_descriptor(
        descriptor_path,
        project_root=project_root,
        expected_id=str(component.get("id") or ""),
        expected_version=str(component.get("version") or ""),
    )
    if new_evaluator_version == current["version"] or new_stack_version == stack.get("version"):
        raise ValueError("Semantic edits require new Evaluator and Stack versions")
    allowed = {item["path"]: item for item in current["editable_files"]}
    if file_path not in allowed:
        raise ValueError("Requested file is not declared editable by this Evaluator")
    target = resolve_inside(project_root, file_path, label="evaluator file")
    target_text = _read_safe(target)
    if _sha256(target_text) != expected_digest:
        raise ValueError("Evaluator source changed after it was opened; reload before saving")
    if target_text == content:
        raise ValueError("Evaluator source is unchanged")

    descriptor["version"] = new_evaluator_version
    stack["version"] = new_stack_version
    for role in allowed[file_path]["affects"]:
        role_component = (stack.get("components") or {}).get(role)
        if not isinstance(role_component, dict):
            raise ValueError(f"Evaluation Stack is missing affected component: {role}")
        role_component["version"] = new_evaluator_version
    family_root = descriptor_path.parent.parent if descriptor_path.parent.name == current["version"] else descriptor_path.parent
    next_bundle = family_root / new_evaluator_version
    if next_bundle.exists():
        raise ValueError("The requested Evaluator version directory already exists")
    temporary_bundle = Path(tempfile.mkdtemp(prefix=f".{new_evaluator_version}.hse-", dir=family_root))
    next_descriptor_path = temporary_bundle / descriptor_path.name
    selected = allowed[file_path]
    try:
        copied: dict[str, Path] = {}
        for item in current["editable_files"]:
            destination = temporary_bundle / item["relative_path"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            source_text = content if item["path"] == file_path else _read_safe(project_root / item["path"])
            destination.write_text(source_text)
            copied[item["role"]] = destination
        next_descriptor_path.write_text(json.dumps(descriptor, ensure_ascii=False, indent=2) + "\n")
        os.replace(temporary_bundle, next_bundle)
        stack["components"]["evaluator"]["entry"] = public_relative(project_root, next_bundle / descriptor_path.name)
        if "rubric" in selected["affects"]:
            rubric_path = next_bundle / next(
                item["relative_path"] for item in current["editable_files"] if item["role"] == "rubric"
            )
            stack["components"]["rubric"]["entry"] = public_relative(project_root, rubric_path)
        next_stack_text = yaml.safe_dump(stack, sort_keys=False, allow_unicode=True)
        _atomic_write(stack_path, next_stack_text)
        updated = inspect_evaluator(project_root=project_root, stack_path=stack_path, include_source=True)
    except Exception:
        if stack_path.read_text() != stack_text:
            _atomic_write(stack_path, stack_text)
        if next_bundle.exists():
            shutil.rmtree(next_bundle)
        if temporary_bundle.exists():
            shutil.rmtree(temporary_bundle)
        raise
    return {
        **updated,
        "updated_file": file_path,
        "requires_fresh_baseline": True,
        "automatic_evaluation": False,
        "automatic_gate": False,
    }
