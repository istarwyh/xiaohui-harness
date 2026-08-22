from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from harbor_dsh_evolution.evaluator import load_evaluator_descriptor
from harbor_dsh_evolution.identity import canonical_digest, public_relative, resolve_inside, tree_digest

STACK_MANIFEST_NAME = "evaluation-stack-manifest.json"
REQUIRED_ROLES = (
    "integration",
    "renderer",
    "evaluator",
    "rubric",
    "diagnoser",
    "optimizer",
    "runner",
    "reporter",
)
COMPARABILITY_ROLES = ("integration", "renderer", "evaluator", "rubric")
VALIDITY_REQUIREMENTS = {
    "input_integrity",
    "agent_completed",
    "integration_valid",
    "renderer_valid",
    "judge_completed",
    "artifact_schema_valid",
}


def load_stack(path: Path) -> dict[str, Any]:
    path = path.expanduser().resolve(strict=True)
    value = yaml.safe_load(path.read_text())
    if not isinstance(value, dict):
        raise ValueError("Evaluation Stack must be a YAML object")
    return value


def validate_stack(path: Path, *, project_root: Path) -> dict[str, Any]:
    project_root = project_root.expanduser().resolve(strict=True)
    path = resolve_inside(project_root, path, label="stack")
    stack = load_stack(path)
    findings: list[dict[str, str]] = []

    def error(code: str, message: str) -> None:
        findings.append({"level": "error", "code": code, "message": message})

    if stack.get("schema_version") != 1:
        error("STACK_SCHEMA_UNSUPPORTED", "Evaluation Stack must use schema_version 1")
    for key in ("stack_id", "version"):
        if not isinstance(stack.get(key), str) or not stack[key].strip():
            error("STACK_IDENTITY_INVALID", f"Evaluation Stack requires non-empty {key}")
    components = stack.get("components")
    if not isinstance(components, dict):
        error("STACK_COMPONENTS_MISSING", "Evaluation Stack requires components")
        components = {}
    normalized: dict[str, dict[str, Any]] = {}
    for role in REQUIRED_ROLES:
        component = components.get(role)
        if not isinstance(component, dict):
            error("STACK_COMPONENT_MISSING", f"Missing {role} component")
            continue
        component_id = component.get("id")
        version = component.get("version")
        entry = component.get("entry")
        if not all(isinstance(value, str) and value.strip() for value in (component_id, version, entry)):
            error("STACK_COMPONENT_INVALID", f"{role} requires id, version, and entry")
            continue
        try:
            entry_path = resolve_inside(project_root, entry, label=f"components.{role}.entry")
            evaluator_interface = None
            if role == "evaluator":
                evaluator_interface = load_evaluator_descriptor(
                    entry_path,
                    project_root=project_root,
                    expected_id=component_id,
                    expected_version=version,
                )
                digest = evaluator_interface["digest"]
            elif entry_path.is_dir():
                digest, _ = tree_digest(entry_path, namespace=f"harbor-dsh-stack-{role}-v1")
            else:
                digest = canonical_digest(
                    {"path": public_relative(project_root, entry_path), "content": entry_path.read_text(errors="replace")},
                    namespace=f"harbor-dsh-stack-{role}-v1",
                )
            normalized_component = {
                "id": component_id,
                "version": version,
                "entry": public_relative(project_root, entry_path),
                "digest": digest,
                "reward_affecting": role in COMPARABILITY_ROLES or (
                    role == "runner" and bool(component.get("semantic"))
                ),
            }
            if evaluator_interface:
                normalized_component["interface"] = evaluator_interface
            normalized[role] = normalized_component
        except (FileNotFoundError, ValueError) as exception:
            code = "EVALUATOR_INTERFACE_INVALID" if role == "evaluator" else "STACK_COMPONENT_ENTRY_INVALID"
            error(code, f"{role} entry is invalid: {exception}")

    judge = stack.get("judge")
    if not isinstance(judge, dict) or not all(
        isinstance(judge.get(key), str) and judge[key].strip()
        for key in ("provider", "model", "version")
    ):
        error("STACK_JUDGE_INVALID", "Judge requires provider, model, and version")
        judge = {}
    evaluation_contract = stack.get("evaluation_contract")
    if not isinstance(evaluation_contract, dict):
        error("EVALUATION_CONTRACT_MISSING", "Evaluation Stack requires evaluation_contract")
        evaluation_contract = {}
    else:
        for key in ("contract_id", "version", "primary_metric"):
            if not isinstance(evaluation_contract.get(key), str) or not evaluation_contract[key].strip():
                error("EVALUATION_CONTRACT_INVALID", f"evaluation_contract requires non-empty {key}")
        metrics = evaluation_contract.get("metrics")
        if not isinstance(metrics, list) or not metrics:
            error("EVALUATION_CONTRACT_INVALID", "evaluation_contract requires metrics")
        evaluator_interface = (normalized.get("evaluator") or {}).get("interface") or {}
        evaluator_criteria = {str(item.get("id")) for item in evaluator_interface.get("criteria") or []}
        aggregate_metric = ((evaluator_interface.get("aggregate") or {}).get("metric_id"))
        contract_metrics = {
            str(item.get("id"))
            for item in metrics or []
            if isinstance(item, dict) and item.get("id") != aggregate_metric
        }
        if evaluator_interface and evaluator_criteria != contract_metrics:
            error(
                "EVALUATOR_CONTRACT_MISMATCH",
                "Evaluator criteria must exactly match non-primary Evaluation Contract metrics",
            )
        requirement_ids = {
            str(item.get("id") or item.get("requirement"))
            for item in evaluation_contract.get("hard_requirements") or []
            if isinstance(item, dict) and (item.get("id") or item.get("requirement"))
        }
        missing_validity = sorted(VALIDITY_REQUIREMENTS - requirement_ids)
        if missing_validity:
            error(
                "EVALUATION_VALIDITY_REQUIREMENTS_MISSING",
                "evaluation_contract must declare Score Validity requirements: "
                + ", ".join(missing_validity),
            )
    forbidden = {"authorization", "cookie", "token", "api_key", "secret", "password"}
    serialized_keys = {str(key).casefold() for key in _walk_keys(stack)}
    if forbidden.intersection(serialized_keys):
        error("STACK_SECRET_FIELD", "Evaluation Stack must not contain secret-bearing fields")

    valid = not any(item["level"] == "error" for item in findings)
    return {"valid": valid, "stack": stack, "components": normalized, "judge": judge, "evaluation_contract": evaluation_contract, "findings": findings, "path": public_relative(project_root, path)}


def _walk_keys(value: Any):
    if isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from _walk_keys(item)
    elif isinstance(value, list):
        for item in value:
            yield from _walk_keys(item)


def snapshot_stack(path: Path, *, project_root: Path) -> dict[str, Any]:
    result = validate_stack(path, project_root=project_root)
    if not result["valid"]:
        codes = ", ".join(item["code"] for item in result["findings"])
        raise ValueError(f"Evaluation Stack validation failed: {codes}")
    stack = result["stack"]
    components = result["components"]
    comparison_components = {
        role: component
        for role, component in components.items()
        if component["reward_affecting"]
    }
    comparison_identity = {
        "components": comparison_components,
        "judge": result["judge"],
    }
    manifest = {
        "schema_version": 1,
        "stack_id": stack["stack_id"],
        "version": stack["version"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": result["path"],
        "digest": canonical_digest(
            {"components": components, "judge": result["judge"]},
            namespace="harbor-dsh-evaluation-stack-v1",
        ),
        "comparison_digest": canonical_digest(
            comparison_identity,
            namespace="harbor-dsh-evaluation-comparison-v2",
        ),
        "components": components,
        "judge": result["judge"],
        "contracts": stack.get("contracts") or {},
        "evaluation_contract": result["evaluation_contract"],
        "labels": stack.get("labels") or {},
    }
    return manifest


def write_stack_manifest(manifest: dict[str, Any], output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return output
