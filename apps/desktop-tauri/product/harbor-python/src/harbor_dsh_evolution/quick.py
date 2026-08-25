from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml

from harbor_dsh_evolution.candidate import snapshot_candidate
from harbor_dsh_evolution.dataset import snapshot_dataset
from harbor_dsh_evolution.initialize import initialize_project


ACP_READY_DOCKERFILE = """FROM redis@sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065

RUN apk add --no-cache bash ca-certificates coreutils curl nodejs npm py3-pip py3-virtualenv python3 \\
    && python3 -m venv /opt/harbor-acp-venv \\
    && /opt/harbor-acp-venv/bin/pip install --no-cache-dir agent-client-protocol

WORKDIR /app
"""


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9._-]+", "-", value.casefold()).strip("._-") or "diagnostic"


def _write_new(path: Path, content: str) -> None:
    if path.exists():
        raise ValueError(
            f"QUICK_DIAGNOSTIC_ALREADY_EXISTS: {path}. Choose another workspace_subdir; existing files are never overwritten."
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def initialize_quick_diagnostic(
    *,
    project_root: Path,
    query: str,
    rubric: str,
    workspace_subdir: str | Path = "harbor-diagnostic",
) -> dict[str, Any]:
    """Generate a runnable wiring experiment that is explicitly not a quality Gate."""
    project_root = project_root.expanduser().resolve(strict=True)
    if not query.strip() or not rubric.strip():
        raise ValueError("Quick diagnostic requires a non-empty query and rubric draft")
    workspace = (project_root / workspace_subdir).resolve()
    if workspace != project_root and project_root not in workspace.parents:
        raise ValueError("WORKSPACE_OUTSIDE_PROJECT_ROOT: workspace_subdir must stay under project_root")
    identity = _slug(Path(workspace_subdir).name)
    candidate = workspace / "candidates" / "diagnostic"
    dataset = workspace / "dataset"
    task = dataset / "wiring-check"

    package = {
        "name": f"{identity}-candidate",
        "version": "1.0.0",
        "private": True,
        "type": "module",
    }
    lock = {
        "name": package["name"],
        "version": package["version"],
        "lockfileVersion": 3,
        "requires": True,
        "packages": {"": {"name": package["name"], "version": package["version"]}},
    }
    _write_new(candidate / "package.json", json.dumps(package, indent=2) + "\n")
    _write_new(candidate / "package-lock.json", json.dumps(lock, indent=2) + "\n")
    _write_new(
        candidate / "cordis.yml",
        """- id: acp-agent
  name: '@deepseek-ai/dsh-acp-demo'
  config:
    provider: diagnostic-placeholder
    model: diagnostic-placeholder
    persistenceRoot: /tmp/dsh-sessions
    persistenceCompression: none
    workspaceContext: false
    persona: |
      Answer the evaluation query directly. This Candidate is only for Harbor wiring diagnostics.
""",
    )
    candidate_manifest = snapshot_candidate(candidate)

    _write_new(
        task / "task.toml",
        f'''schema_version = "1.4"
artifacts = []

[task]
name = "diagnostic/{identity}"
version = "1.0.0"
description = "Harbor wiring diagnostic; not valid for promotion."
authors = []
keywords = ["diagnostic", "harbor"]

[metadata]
query = {json.dumps(query.strip(), ensure_ascii=False)}
diagnostic_only = true

[verifier]
timeout_sec = 120.0
collect = []

[verifier.env]

[agent]
timeout_sec = 600.0

[environment]
network_mode = "public"
build_timeout_sec = 600.0
os = "linux"
mcp_servers = []

[environment.env]

[solution.env]
''',
    )
    _write_new(
        task / "instruction.md",
        f"{query.strip()}\n\nThis is a wiring diagnostic. Return a user-visible answer; no promotion decision may use this Task.\n",
    )
    _write_new(task / "environment" / "Dockerfile", ACP_READY_DOCKERFILE)
    _write_new(
        task / "tests" / "test.sh",
        """#!/bin/sh
set -eu
mkdir -p /logs/verifier
printf '{"reward":1,"quality":1}\n' > /logs/verifier/reward.json
printf '{"schema_version":1,"protocol":"evaluation-result/v1","criteria":[{"id":"quality","score":1,"reason":"Diagnostic only: Candidate execution reached the Harbor verifier; the business Rubric was not applied.","recommendation":"Replace this wiring verifier with the accepted business Evaluator before any quality comparison or promotion."}]}\n' > /logs/verifier/evaluation-result.json
""",
    )
    dataset_manifest = snapshot_dataset(dataset, dataset_id=f"{identity}-diagnostic", version="1.0.0")
    initialized = initialize_project(
        project_root=project_root,
        dataset_path=dataset,
        stack_id=f"{identity}-diagnostic",
        stack_version="1.0.0",
        dataset_id=dataset_manifest["dataset_id"],
        dataset_version=dataset_manifest["version"],
        contract_id=f"{identity}-diagnostic-contract",
        contract_version="1.0.0",
        primary_metric="reward",
        primary_direction="maximize",
        judge_provider="deterministic",
        judge_model="wiring-only",
        judge_version="1.0.0",
        policy_id=f"{identity}-diagnostic-policy",
        policy_version="1.0.0",
        min_improvement=0,
        workspace_subdir=workspace.relative_to(project_root),
    )
    stack_path = project_root / initialized["stack_path"]
    stack = yaml.safe_load(stack_path.read_text())
    stack["labels"] = {**(stack.get("labels") or {}), "diagnostic_only": True}
    stack_path.write_text(yaml.safe_dump(stack, sort_keys=False, allow_unicode=True))
    policy_path = workspace / "policies" / "promotion.json"
    policy = json.loads(policy_path.read_text())
    policy["diagnostic_only"] = True
    policy_path.write_text(json.dumps(policy, ensure_ascii=False, indent=2) + "\n")
    rubric_path = workspace / "evaluators" / "default" / "rubric.md"
    rubric_path.write_text(
        "# Business Rubric draft (not executed by quick diagnostic)\n\n"
        + rubric.strip()
        + "\n\nThe quick diagnostic score only proves wiring. Implement this Rubric in a versioned Evaluator before formal evaluation.\n"
    )
    return {
        "schema_version": 1,
        "mode": "diagnostic",
        "promotion_eligible": False,
        "warning": "The generated score proves only Candidate-to-Harbor wiring; it does not apply the business Rubric.",
        "workspace": workspace.relative_to(project_root).as_posix(),
        "candidate_path": candidate.relative_to(project_root).as_posix(),
        "dataset_path": dataset.relative_to(project_root).as_posix(),
        "stack_path": initialized["stack_path"],
        "policy_path": policy_path.relative_to(project_root).as_posix(),
        "candidate_manifest": candidate_manifest.to_dict(),
        "dataset_manifest": dataset_manifest,
        "next_actions": [
            "Run Architecture Doctor in diagnostic mode",
            "Run one diagnostic Harbor Job using the returned paths and the current DSH model",
            "Replace the wiring verifier with a versioned business Evaluator before creating a Baseline",
        ],
    }
