from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from harbor_dsh_evolution.dataset import MANIFEST_NAME, snapshot_dataset, validate_dataset
from harbor_dsh_evolution.identity import resolve_inside


ROLE_PATHS = {
    "integration": "integrations/default.py",
    "renderer": "renderers/default.py",
    "evaluator": "evaluators/default/evaluator.json",
    "rubric": "evaluators/default/rubric.md",
    "diagnoser": "diagnosers/default.py",
    "optimizer": "optimizers/default.py",
    "runner": "runners/harbor.py",
    "reporter": "reporters/default.py",
}


def _write_new(path: Path, content: str, created: list[str], existing: list[str], root: Path) -> None:
    relative = path.relative_to(root).as_posix()
    if path.exists():
        existing.append(relative)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    created.append(relative)


def initialize_project(
    *,
    project_root: Path,
    dataset_path: Path,
    stack_id: str,
    stack_version: str,
    dataset_id: str,
    dataset_version: str,
    contract_id: str,
    contract_version: str,
    primary_metric: str,
    primary_direction: str,
    judge_provider: str,
    judge_model: str,
    judge_version: str,
    policy_id: str,
    policy_version: str,
    min_improvement: float,
) -> dict[str, Any]:
    project_root = project_root.expanduser().resolve(strict=True)
    dataset_path = resolve_inside(project_root, dataset_path, label="dataset")
    if primary_direction not in {"maximize", "minimize"}:
        raise ValueError("primary_direction must be maximize or minimize")
    required = {
        "stack_id": stack_id,
        "stack_version": stack_version,
        "dataset_id": dataset_id,
        "dataset_version": dataset_version,
        "contract_id": contract_id,
        "contract_version": contract_version,
        "primary_metric": primary_metric,
        "judge_provider": judge_provider,
        "judge_model": judge_model,
        "judge_version": judge_version,
        "policy_id": policy_id,
        "policy_version": policy_version,
    }
    missing = [key for key, value in required.items() if not value.strip()]
    if missing:
        raise ValueError(f"Initialization requires: {', '.join(missing)}")

    created: list[str] = []
    existing: list[str] = []
    for directory in ("candidates", "datasets", "integrations", "renderers", "evaluators", "rubrics", "diagnosers", "optimizers", "reporters", "runners", "policies", "jobs", ".harbor"):
        (project_root / directory).mkdir(exist_ok=True)

    evaluator_id = f"{stack_id}-evaluator"
    evaluator_implementation = '''"""Implement harbor-dsh-evaluator/v1 for this business domain."""

def evaluate(payload):
    return {
        "schema_version": 1,
        "protocol": "evaluation-result/v1",
        "criteria": [
            {"id": "quality", "score": 0, "reason": "Replace the placeholder evaluator."},
        ],
    }
'''
    _write_new(project_root / "evaluators/default/evaluator.py", evaluator_implementation, created, existing, project_root)

    for role, relative in ROLE_PATHS.items():
        if role == "rubric":
            content = f"# {contract_id}\n\nDefine the evidence-backed rubric for `{primary_metric}` here.\n"
        elif role == "evaluator":
            content = json.dumps(
                {
                    "schema_version": 1,
                    "interface": "harbor-dsh-evaluator/v1",
                    "evaluator_id": evaluator_id,
                    "version": stack_version,
                    "kind": "script",
                    "protocol": {"input": "evaluation-input/v1", "output": "evaluation-result/v1"},
                    "implementation": {"entry": "evaluator.py", "language": "python", "callable": "evaluate"},
                    "editable_files": [
                        {"path": "evaluator.py", "role": "implementation", "language": "python", "affects": ["evaluator"]},
                        {"path": "rubric.md", "role": "rubric", "language": "markdown", "affects": ["evaluator", "rubric"]},
                    ],
                    "criteria": [{"id": "quality", "label": "Quality", "values": [0, 0.5, 1]}],
                    "aggregate": {"metric_id": primary_metric, "method": "mean"},
                },
                ensure_ascii=False,
                indent=2,
            ) + "\n"
        elif role == "runner":
            content = '"""Harbor orchestration only. Keep HTTP, rubric, judge, and promotion outside this Runner."""\n\nROLE = "runner"\n'
        else:
            content = f'"""Replace with the project-specific {role} implementation."""\n\nROLE = "{role}"\n'
        _write_new(project_root / relative, content, created, existing, project_root)

    if not (dataset_path / MANIFEST_NAME).exists():
        snapshot_dataset(dataset_path, dataset_id=dataset_id, version=dataset_version)
        created.append((dataset_path / MANIFEST_NAME).relative_to(project_root).as_posix())
    validation = validate_dataset(dataset_path, project_root=project_root)
    if not validation.valid:
        raise ValueError("Dataset initialization failed validation: " + ", ".join(item["code"] for item in validation.findings))

    components = {
        role: {"id": f"{stack_id}-{role}", "version": stack_version, "entry": relative, **({"semantic": False} if role == "runner" else {})}
        for role, relative in ROLE_PATHS.items()
    }
    stack = {
        "schema_version": 1,
        "stack_id": stack_id,
        "version": stack_version,
        "components": components,
        "judge": {"provider": judge_provider, "model": judge_model, "version": judge_version, "parameters": {}},
        "evaluation_contract": {
            "contract_id": contract_id,
            "version": contract_version,
            "primary_metric": primary_metric,
            "metrics": [
                {"id": primary_metric, "label": primary_metric, "direction": primary_direction},
                {"id": "quality", "label": "Quality", "direction": primary_direction},
            ],
            "groups": [],
            "hard_requirements": [
                {"id": "input_integrity"},
                {"id": "agent_completed"},
                {"id": "integration_valid"},
                {"id": "renderer_valid"},
                {"id": "judge_completed"},
                {"id": "artifact_schema_valid"},
            ],
        },
        "labels": {},
    }
    _write_new(project_root / ".harbor/evaluation-stack.yml", yaml.safe_dump(stack, sort_keys=False, allow_unicode=True), created, existing, project_root)
    dataset_relative = dataset_path.relative_to(project_root).as_posix()
    evolution = {
        "schema_version": 1,
        "stack": ".harbor/evaluation-stack.yml",
        "dataset": dataset_relative,
        "jobs": "jobs",
        "promotion_policy": "policies/promotion.json",
        "candidate_root": "candidates",
    }
    _write_new(project_root / ".harbor/evolution.yml", yaml.safe_dump(evolution, sort_keys=False), created, existing, project_root)
    policy = {
        "schema_version": 2,
        "policy_id": policy_id,
        "version": policy_version,
        "primary_metric": primary_metric,
        "primary_direction": primary_direction,
        "min_improvement": min_improvement,
        "minimums": {},
        "maximums": {},
        "non_regression": [],
        "metric_directions": {primary_metric: primary_direction},
        "non_regression_tolerance": 0,
        "hard_requirements": ["exception_free", "artifact_schema_valid", "doctor_error_free"],
    }
    _write_new(project_root / "policies/promotion.json", json.dumps(policy, ensure_ascii=False, indent=2) + "\n", created, existing, project_root)
    return {
        "schema_version": 1,
        "initialized": True,
        "created": created,
        "preserved": existing,
        "dataset_validation": validation.to_dict(),
        "next_actions": [
            "Replace placeholder stack components with business implementations",
            "Add diagnostic and non-regression metrics to the Evaluation Contract and Promotion Policy",
            "Run harbor-dsh doctor --architecture before the first promotion-eligible Job",
        ],
    }
