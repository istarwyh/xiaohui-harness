from __future__ import annotations

import json
import hashlib
import re
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any

from harbor_dsh_evolution.candidate import verify_candidate
from harbor_dsh_evolution.dataset import validate_dataset
from harbor_dsh_evolution.identity import resolve_inside
from harbor_dsh_evolution.promotion import load_policy
from harbor_dsh_evolution.stack import validate_stack


def _evaluator_artifact_findings(
    dataset_root: Path,
    dataset_manifest: dict[str, Any] | None,
    stack: dict[str, Any],
) -> list[dict[str, str]]:
    interface = ((stack.get("components") or {}).get("evaluator") or {}).get("interface")
    if not isinstance(interface, dict):
        return []
    findings: list[dict[str, str]] = []
    for task in (dataset_manifest or {}).get("tasks") or []:
        if not isinstance(task, dict) or not isinstance(task.get("path"), str):
            continue
        try:
            task_root = resolve_inside(dataset_root, task["path"], label="task.path")
        except (FileNotFoundError, ValueError):
            continue
        tests = task_root / "tests"
        content = "\n".join(
            path.read_text(errors="replace")
            for path in tests.rglob("*")
            if path.is_file() and not path.is_symlink() and path.stat().st_size <= 512_000
        ) if tests.is_dir() else ""
        if "evaluation-result.json" not in content:
            findings.append(
                {
                    "level": "error",
                    "code": "EVALUATOR_RESULT_OUTPUT_MISSING",
                    "message": (
                        f"Task {task.get('id') or task['path']} has a harbor-dsh-evaluator/v1 Stack "
                        "but its verifier does not declare /logs/verifier/evaluation-result.json output. "
                        "Write evaluation-result/v1 with a reason and recommendation for every Criterion."
                    ),
                }
            )
    return findings


def _docker_runtime_findings(
    dataset_root: Path,
    dataset_manifest: dict[str, Any] | None,
) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    docker = shutil.which("docker")
    if not docker:
        return [{
            "level": "error",
            "code": "DOCKER_UNAVAILABLE",
            "message": "Docker CLI is not available; install/start Docker before running a Harbor Job.",
        }]
    try:
        server = subprocess.run(
            [docker, "version", "--format", "{{.Server.Version}}"],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return [{
            "level": "error",
            "code": "DOCKER_DAEMON_UNAVAILABLE",
            "message": f"Docker daemon preflight failed: {error}",
        }]
    if server.returncode != 0:
        return [{
            "level": "error",
            "code": "DOCKER_DAEMON_UNAVAILABLE",
            "message": "Docker CLI is installed but the daemon is unavailable; start Docker and retry.",
        }]

    docker_config = Path.home() / ".docker" / "config.json"
    try:
        configuration = json.loads(docker_config.read_text()) if docker_config.is_file() else {}
    except (OSError, json.JSONDecodeError):
        configuration = {}
    credential_helpers = configuration.get("credHelpers")
    helpers = {str(configuration.get("credsStore") or "")}
    if isinstance(credential_helpers, dict):
        helpers.update(str(value) for value in credential_helpers.values())
    for helper in sorted(value for value in helpers if value):
        executable = f"docker-credential-{helper}"
        if shutil.which(executable) is None:
            findings.append({
                "level": "warning",
                "code": "DOCKER_CREDENTIAL_HELPER_MISSING",
                "message": (
                    f"Docker config references {executable}, but it is not on PATH. "
                    "Public image pulls may fail; repair the helper or use a verified local image."
                ),
            })

    images: set[str] = set()
    for task in (dataset_manifest or {}).get("tasks") or []:
        if not isinstance(task, dict) or not isinstance(task.get("environment"), str):
            continue
        try:
            dockerfile = resolve_inside(dataset_root, task["environment"], label="task.environment")
            content = dockerfile.read_text(errors="replace")
        except (FileNotFoundError, OSError, ValueError):
            continue
        match = re.search(r"(?im)^\s*FROM(?:\s+--platform=\S+)?\s+([^\s]+)", content)
        if match and match.group(1).casefold() != "scratch" and "$" not in match.group(1):
            images.add(match.group(1))
        lowered = content.casefold()
        missing = [name for name in ("python", "curl", "node") if name not in lowered]
        if missing:
            findings.append({
                "level": "warning",
                "code": "ACP_SETUP_READINESS_UNPROVEN",
                "message": (
                    f"Task {task.get('id') or task.get('path')} Dockerfile does not prove ACP runtime "
                    f"dependencies ({', '.join(missing)}). If the base image does not preinstall them, Agent setup may time out."
                ),
            })
    for image in sorted(images):
        try:
            inspected = subprocess.run(
                [docker, "image", "inspect", image],
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            inspected = None
        if inspected is None or inspected.returncode != 0:
            findings.append({
                "level": "warning",
                "code": "DOCKER_BASE_IMAGE_NOT_LOCAL",
                "message": (
                    f"Base image {image} is not present locally. Harbor will need to pull it; "
                    "verify registry access and Docker credential helper availability first."
                ),
            })
    return findings


def architecture_doctor(
    *,
    project_root: Path,
    stack_path: Path,
    dataset_path: Path,
    candidate_path: Path | None = None,
    policy_path: Path | None = None,
    runtime_checks: bool = False,
) -> dict[str, Any]:
    project_root = project_root.expanduser().resolve(strict=True)
    findings: list[dict[str, str]] = []

    stack = validate_stack(stack_path, project_root=project_root)
    findings.extend(stack["findings"])
    if bool(((stack.get("stack") or {}).get("labels") or {}).get("diagnostic_only")):
        findings.append({
            "level": "error",
            "code": "DIAGNOSTIC_ONLY_STACK",
            "message": "This Stack is a wiring diagnostic and can never become promotion-ready; create a formal versioned Evaluator and Stack.",
        })
    dataset = validate_dataset(dataset_path, project_root=project_root)
    findings.extend(dataset.findings)
    dataset_root = resolve_inside(project_root, dataset_path, label="dataset")
    findings.extend(_evaluator_artifact_findings(dataset_root, dataset.manifest, stack))
    if runtime_checks:
        findings.extend(_docker_runtime_findings(dataset_root, dataset.manifest))
    duplicate_kinds = {
        "judge.py": ("DATASET_DUPLICATE_EVALUATOR", "Evaluator"),
        "Dockerfile": ("DATASET_DUPLICATE_ENVIRONMENT", "Environment"),
        "rubric.json": ("DATASET_DUPLICATE_RUBRIC", "Rubric"),
        "rubric.yml": ("DATASET_DUPLICATE_RUBRIC", "Rubric"),
        "rubric.yaml": ("DATASET_DUPLICATE_RUBRIC", "Rubric"),
    }
    duplicate_groups: dict[tuple[str, str], list[str]] = defaultdict(list)
    for artifact in dataset_root.rglob("*"):
        if not artifact.is_file() or artifact.name not in duplicate_kinds:
            continue
        code, label = duplicate_kinds[artifact.name]
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        duplicate_groups[(code, f"{label}:{digest}")].append(
            artifact.relative_to(dataset_root).as_posix()
        )
    for (code, label_digest), paths in sorted(duplicate_groups.items()):
        if len(paths) < 2:
            continue
        label = label_digest.split(":", 1)[0]
        preview = ", ".join(paths[:3])
        suffix = "" if len(paths) <= 3 else f" and {len(paths) - 3} more"
        findings.append(
            {
                "level": "warning",
                "code": code,
                "message": (
                    f"Found {len(paths)} identical {label} files ({preview}{suffix}); "
                    f"extract one shared {label} Stack component and reference it from task metadata"
                ),
            }
        )

    if candidate_path is not None:
        try:
            candidate = verify_candidate(resolve_inside(project_root, candidate_path, label="candidate"))
            findings.append({"level": "info", "code": "CANDIDATE_VERIFIED", "message": f"Candidate {candidate.candidate_id}@{candidate.version} is immutable"})
        except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
            findings.append({"level": "error", "code": "CANDIDATE_INVALID", "message": str(error)})
    if policy_path is not None:
        try:
            load_policy(resolve_inside(project_root, policy_path, label="policy"))
            findings.append({"level": "info", "code": "POLICY_VERIFIED", "message": "Promotion Policy is valid and versioned"})
        except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
            findings.append({"level": "error", "code": "PROMOTION_POLICY_INVALID", "message": str(error)})

    runner = stack.get("components", {}).get("runner")
    if runner:
        runner_path = resolve_inside(project_root, runner["entry"], label="runner")
        sources = [runner_path] if runner_path.is_file() else list(runner_path.rglob("*"))
        content = "\n".join(
            item.read_text(errors="replace")
            for item in sources
            if item.is_file() and item.stat().st_size <= 512_000
        )
        lowered = content.casefold()
        has_http = bool(re.search(r"\b(requests|fetch|axios|httpx|urllib|http\.client)\b", lowered))
        has_rubric = "rubric" in lowered
        has_judge = bool(re.search(r"\b(judge|llm|openai|anthropic)\b", lowered))
        if has_http and has_rubric and has_judge:
            findings.append({"level": "error", "code": "GOD_RUNNER_HTTP_RUBRIC_JUDGE", "message": "Runner mixes HTTP integration, Rubric, and Judge responsibilities; move them into Integration, Rubric, and Evaluator components"})
        if re.search(r"\b(def\s+promote|promote\s*\(|promotion_decision\s*=|decision\s*=\s*['\"]promote|promote\s*=\s*(true|false))", lowered):
            findings.append({"level": "error", "code": "RUNNER_DIRECT_PROMOTION", "message": "Runner must not make promotion decisions; write fixed metrics and let the versioned Promotion Policy decide"})
        if "optimization-report.json" in lowered:
            findings.append({"level": "warning", "code": "RUNNER_WRITES_OPTIMIZATION_REPORT", "message": "Runner writes optimization-report.json; move post-hoc recommendations into the Optimizer or Reporter after Harbor summary"})
        has_dimension_score = bool(re.search(r"\bd\d+(?:_\d+)?\b", lowered))
        has_reward_definition = bool(re.search(r"\breward\s*(?:=|:)", lowered))
        has_protocol_key = bool(re.search(r"\b(sse|frame|payload|component_id|protocol_valid)\b", lowered))
        if has_dimension_score and has_reward_definition and has_protocol_key:
            findings.append({"level": "warning", "code": "RUNNER_BUSINESS_EVALUATION_LOGIC", "message": "Runner contains dimension scores, reward definition, and business protocol keys; move protocol parsing to Renderer and scoring to Evaluator/Rubric"})
        lines = content.count("\n") + 1
        if lines > 500:
            findings.append({"level": "warning", "code": "RUNNER_TOO_LARGE", "message": f"Runner contains {lines} lines; split orchestration from evaluation roles"})
        role_hits = sum(token in lowered for token in ("render", "evaluate", "diagnose", "optimize", "report"))
        if role_hits >= 4:
            findings.append({"level": "warning", "code": "RUNNER_MULTI_ROLE", "message": "Runner appears to implement multiple stack roles"})

    if not findings:
        findings.append({"level": "ok", "code": "ARCHITECTURE_READY", "message": "Evaluation architecture is ready"})
    counts = {
        level: sum(item["level"] == level for item in findings)
        for level in ("error", "warning", "info", "ok")
    }
    return {
        "schema_version": 1,
        "promotion_ready": counts["error"] == 0,
        "counts": counts,
        "findings": findings,
    }
