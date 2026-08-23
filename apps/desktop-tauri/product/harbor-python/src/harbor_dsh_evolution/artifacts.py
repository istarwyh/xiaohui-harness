from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Iterable
from urllib.parse import unquote, urlparse

from jsonschema import Draft202012Validator

from harbor_dsh_evolution.evaluator import validate_evaluation_result

SENSITIVE_KEY = re.compile(
    r"authorization|cookie|token|api[_-]?key|secret|password|request[_-]?headers",
    re.I,
)
LOCAL_PATH = re.compile(r"(?:/[A-Za-z0-9._ -]+){2,}")
MAX_TEXT = 8_000

VALIDITY_REQUIREMENTS = (
    "input_integrity",
    "agent_completed",
    "integration_valid",
    "renderer_valid",
    "judge_completed",
    "artifact_schema_valid",
)

_SCHEMAS: dict[str, dict[str, Any]] = {
    "evaluation-contract.json": {
        "type": "object",
        "required": ["schema_version", "contract_id", "version", "primary_metric", "metrics"],
        "properties": {
            "schema_version": {"const": 1},
            "contract_id": {"type": "string", "minLength": 1},
            "version": {"type": "string", "minLength": 1},
            "primary_metric": {"type": "string", "minLength": 1},
            "metrics": {"type": "array", "minItems": 1},
        },
    },
    "dataset-preview.json": {
        "type": "object",
        "required": ["schema_version", "dataset_id", "version", "source_digest", "task_count", "tasks"],
        "properties": {
            "schema_version": {"const": 1},
            "dataset_id": {"type": "string", "minLength": 1},
            "version": {"type": "string", "minLength": 1},
            "source_digest": {"type": "string", "minLength": 1},
            "task_count": {"type": "integer", "minimum": 0},
            "tasks": {"type": "array"},
        },
    },
    "population-report.json": {
        "type": "object",
        "required": ["schema_version", "population_size", "valid_population_size", "groups", "metrics"],
        "properties": {
            "schema_version": {"const": 2},
            "population_size": {"type": "integer", "minimum": 0},
            "valid_population_size": {"type": "integer", "minimum": 0},
            "groups": {"type": "array"},
            "metrics": {"type": "object"},
        },
    },
    "trial-assessment-v2.json": {
        "type": "object",
        "required": [
            "schema_version",
            "trial_id",
            "query",
            "population",
            "status",
            "score",
            "requirements",
            "criteria",
            "output",
            "evidence_provenance",
            "exception",
        ],
        "properties": {
            "schema_version": {"const": 2},
            "trial_id": {"type": "string", "minLength": 1},
            "query": {"type": "string"},
            "population": {"type": "object"},
            "status": {
                "enum": [
                    "completed",
                    "candidate-quality-failed",
                    "infrastructure-error",
                    "evaluation-error",
                    "cancelled",
                ]
            },
            "score": {
                "type": "object",
                "required": ["value", "valid", "invalid_reasons"],
                "properties": {
                    "value": {"type": ["number", "null"]},
                    "valid": {"type": "boolean"},
                    "invalid_reasons": {"type": "array", "items": {"type": "string"}},
                },
            },
            "requirements": {
                "type": "object",
                "required": list(VALIDITY_REQUIREMENTS),
                "additionalProperties": {"type": "boolean"},
            },
            "criteria": {"type": "array"},
            "evidence_provenance": {"type": "array"},
        },
    },
    "optimization-report.json": {
        "type": "object",
        "required": ["schema_version", "hook", "hypotheses"],
        "properties": {
            "schema_version": {"const": 2},
            "hook": {
                "type": "object",
                "required": ["id", "version", "reward_affecting", "status"],
            },
            "hypotheses": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "id",
                        "evidence_refs",
                        "root_cause",
                        "affected_trials",
                        "expected_metric_effect",
                        "mutation_surface",
                        "forbidden_surface",
                        "guardrails",
                        "rollback_condition",
                        "next_experiment",
                    ],
                },
            },
        },
    },
    "diagnosis-report.json": {
        "type": "object",
        "required": ["schema_version", "hook", "diagnoses"],
        "properties": {
            "schema_version": {"const": 1},
            "hook": {
                "type": "object",
                "required": ["id", "version", "reward_affecting", "status"],
            },
            "diagnoses": {"type": "array"},
        },
    },
    "artifact-registry.json": {
        "type": "object",
        "required": ["schema_version", "artifacts"],
        "properties": {
            "schema_version": {"const": 1},
            "artifacts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["role", "artifact", "path", "schema", "reward_affecting", "status"],
                },
            },
        },
    },
    "promotion-report.json": {
        "type": "object",
        "required": ["schema_version", "decision", "reasons"],
        "properties": {
            "schema_version": {"const": 2},
            "decision": {"enum": ["PROMOTE", "REJECT"]},
            "reasons": {"type": "array"},
        },
    },
}


def _schema_errors(name: str, value: Any) -> list[str]:
    return [error.message for error in Draft202012Validator(_SCHEMAS[name]).iter_errors(value)]


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if SENSITIVE_KEY.search(str(key)) else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value[:200]]
    if isinstance(value, str):
        value = LOCAL_PATH.sub("[local path]", value)
        if len(value) > MAX_TEXT:
            return f"{value[:MAX_TEXT]}\n[TRUNCATED {len(value) - MAX_TEXT} chars]"
    return value


def _numbers(value: Any) -> dict[str, float]:
    return {
        str(key): float(item)
        for key, item in (value or {}).items()
        if isinstance(item, int | float) and not isinstance(item, bool)
    }


def _hard_requirement_ids(contract: dict[str, Any]) -> set[str]:
    result = set()
    for requirement in contract.get("hard_requirements") or []:
        if isinstance(requirement, str):
            result.add(requirement)
        elif isinstance(requirement, dict):
            identity = requirement.get("id") or requirement.get("requirement")
            if identity:
                result.add(str(identity))
    return result


def _task_for(payload: dict[str, Any], task_lookup: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return task_lookup.get(str(payload.get("task_name"))) or {}


def _reported_validity(payload: dict[str, Any]) -> dict[str, bool]:
    verifier = payload.get("verifier_result") or {}
    reported = verifier.get("validity") or verifier.get("requirements") or {}
    return {
        key: bool(reported[key])
        for key in VALIDITY_REQUIREMENTS
        if key in reported and isinstance(reported[key], bool)
    }


def _safe_trial_dir(payload: dict[str, Any], job_dir: Path) -> Path | None:
    uri = payload.get("trial_uri")
    if not isinstance(uri, str):
        return None
    parsed = urlparse(uri)
    if parsed.scheme not in {"", "file"}:
        return None
    try:
        candidate = Path(unquote(parsed.path if parsed.scheme else uri)).resolve(strict=True)
        root = job_dir.resolve(strict=True)
    except (FileNotFoundError, OSError):
        return None
    if candidate.parent != root or not candidate.is_dir() or candidate.is_symlink():
        return None
    return candidate


def _evaluator_result(payload: dict[str, Any], job_dir: Path) -> dict[str, Any] | None:
    trial_dir = _safe_trial_dir(payload, job_dir)
    if trial_dir is None:
        return None
    source = trial_dir / "verifier" / "evaluation-result.json"
    try:
        resolved = source.resolve(strict=True)
        verifier_root = (trial_dir / "verifier").resolve(strict=True)
        if resolved.parent != verifier_root or resolved.is_symlink() or not resolved.is_file():
            return None
        if resolved.stat().st_size > 128_000:
            return None
        value = json.loads(resolved.read_text())
        return value if isinstance(value, dict) else None
    except (FileNotFoundError, json.JSONDecodeError, OSError, UnicodeDecodeError):
        return None


def _renderable_file(path: Path, trial_dir: Path) -> dict[str, Any] | None:
    try:
        resolved = path.resolve(strict=True)
        artifact_root = (trial_dir / "artifacts").resolve(strict=True)
        if resolved.is_symlink() or not resolved.is_file():
            return None
        if resolved != artifact_root and artifact_root not in resolved.parents:
            return None
        if resolved.stat().st_size > 512_000:
            return None
        suffix = resolved.suffix.casefold()
        if suffix not in {".json", ".md", ".markdown", ".txt", ".html", ".htm"}:
            return None
        text = resolved.read_text()
        relative = resolved.relative_to(trial_dir).as_posix()
        if suffix == ".json":
            content: Any = json.loads(text)
            kind = "document" if isinstance(content, dict) and any(key in content for key in ("answer", "content", "report", "markdown")) else "structured"
            format_name = "json"
        elif suffix in {".html", ".htm"}:
            content, kind, format_name = text, "page", "html"
        elif suffix in {".md", ".markdown"}:
            content, kind, format_name = text, "document", "markdown"
        else:
            content, kind, format_name = text, "document", "text"
        return {
            "kind": kind,
            "format": format_name,
            "title": resolved.name,
            "content": content,
            "artifact_ref": relative,
        }
    except (FileNotFoundError, json.JSONDecodeError, OSError, UnicodeDecodeError, ValueError):
        return None


def _captured_agent_output(payload: dict[str, Any], job_dir: Path) -> dict[str, Any] | None:
    trial_dir = _safe_trial_dir(payload, job_dir)
    if trial_dir is None:
        return None
    manifest_path = trial_dir / "artifacts" / "manifest.json"
    if manifest_path.is_file() and not manifest_path.is_symlink():
        try:
            entries = json.loads(manifest_path.read_text())
        except (json.JSONDecodeError, OSError, UnicodeDecodeError):
            entries = []
        candidates: list[Path] = []
        for entry in entries if isinstance(entries, list) else []:
            if not isinstance(entry, dict) or entry.get("status") not in {"ok", "collected", "mounted"}:
                continue
            destination = entry.get("destination")
            if isinstance(destination, str) and destination.startswith("artifacts/"):
                candidates.append(trial_dir / destination)
        priority = {".html": 0, ".htm": 0, ".md": 1, ".markdown": 1, ".txt": 2, ".json": 3}
        for candidate in sorted(candidates, key=lambda item: (priority.get(item.suffix.casefold(), 99), item.as_posix())):
            preview = _renderable_file(candidate, trial_dir)
            if preview is not None:
                preview["source"] = "agent-artifact"
                return preview
    trajectory_path = trial_dir / "agent" / "trajectory.json"
    try:
        if trajectory_path.is_symlink() or trajectory_path.stat().st_size > 2_000_000:
            return None
        trajectory = json.loads(trajectory_path.read_text())
        messages = [
            step.get("message")
            for step in trajectory.get("steps") or []
            if isinstance(step, dict) and step.get("source") == "agent" and isinstance(step.get("message"), str)
        ]
        if messages:
            return {
                "kind": "document",
                "format": "text",
                "title": "Agent final response",
                "content": messages[-1],
                "artifact_ref": trajectory_path.relative_to(trial_dir).as_posix(),
                "source": "acp-final-response",
            }
    except (FileNotFoundError, json.JSONDecodeError, OSError, UnicodeDecodeError, ValueError):
        return None
    return None


def trial_assessment(
    payload: dict[str, Any],
    *,
    evaluation_contract: dict[str, Any],
    task: dict[str, Any] | None = None,
) -> dict[str, Any]:
    task = task or {}
    exception = payload.get("exception_info")
    verifier = payload.get("verifier_result")
    rewards = _numbers((verifier or {}).get("rewards"))
    primary_metric = str(evaluation_contract.get("primary_metric") or "reward")
    query = str(task.get("query") or task.get("instruction") or payload.get("task_name") or "")
    input_integrity = bool(query.strip()) and "[object object]" not in query.lower()
    requirements = {
        "input_integrity": input_integrity,
        "agent_completed": exception is None and payload.get("agent_result") is not None,
        "integration_valid": exception is None and verifier is not None,
        "renderer_valid": exception is None and verifier is not None,
        "judge_completed": exception is None and verifier is not None,
        "artifact_schema_valid": True,
    }
    requirements.update(_reported_validity(payload))
    hard = _hard_requirement_ids(evaluation_contract)
    invalid_reasons: list[str] = []
    if exception:
        invalid_reasons.append("infrastructure-error")
    if verifier is None:
        invalid_reasons.append("evaluation-not-completed")
    if primary_metric not in rewards:
        invalid_reasons.append(f"primary-metric-missing:{primary_metric}")
    evaluator_interface = payload.get("evaluator_interface")
    evaluator_result = payload.get("evaluator_result") if isinstance(payload.get("evaluator_result"), dict) else None
    if isinstance(evaluator_interface, dict):
        try:
            if evaluator_result is None:
                raise ValueError("evaluation-result.json is missing")
            validate_evaluation_result(
                evaluator_result,
                criteria=list(evaluator_interface.get("criteria") or []),
            )
        except ValueError as error:
            requirements["artifact_schema_valid"] = False
            invalid_reasons.append(f"evaluator-result-invalid:{error}")
    for requirement in VALIDITY_REQUIREMENTS:
        if not requirements[requirement] and (
            requirement in hard or requirement in {"input_integrity", "agent_completed", "judge_completed"}
        ):
            invalid_reasons.append(f"requirement-failed:{requirement}")
    invalid_reasons = list(dict.fromkeys(invalid_reasons))
    valid = not invalid_reasons
    score_value = rewards.get(primary_metric) if valid else None

    evidence_provenance: list[dict[str, Any]] = []
    output: Any = None
    if isinstance(verifier, dict):
        for key in ("rendered_output", "output", "answer"):
            if verifier.get(key) is not None:
                output = verifier[key]
                evidence_provenance.append(
                    {
                        "id": "renderer-output",
                        "kind": "real-renderer",
                        "label": "Real Renderer",
                        "artifact_ref": f"verifier_result.{key}",
                        "reward_affecting": True,
                    }
                )
                break
    captured_output = payload.get("captured_output")
    if output is None and isinstance(captured_output, dict):
        output = captured_output
        evidence_provenance.append(
            {
                "id": "agent-artifact" if captured_output.get("source") == "agent-artifact" else "acp-final-response",
                "kind": str(captured_output.get("source") or "acp-final-response"),
                "label": "Agent Artifact" if captured_output.get("source") == "agent-artifact" else "ACP Final Response",
                "artifact_ref": str(captured_output.get("artifact_ref") or "agent/trajectory.json"),
                "reward_affecting": False,
            }
        )
    if output is None and payload.get("agent_result") is not None:
        output = {"kind": "runtime-metadata", "format": "json", "title": "Agent result metadata", "content": payload.get("agent_result")}
        evidence_provenance.append(
            {
                "id": "agent-result-metadata",
                "kind": "agent-result-metadata",
                "label": "Agent Result Metadata",
                "artifact_ref": "agent_result",
                "reward_affecting": False,
            }
        )
    if isinstance(verifier, dict) and verifier.get("judge_explanation"):
        evidence_provenance.append(
            {
                "id": "judge-explanation",
                "kind": "judge-explanation",
                "label": "Judge Explanation",
                "artifact_ref": "verifier_result.judge_explanation",
                "reward_affecting": True,
            }
        )

    metric_labels = {
        str(item.get("id")): str(item.get("label") or item.get("id"))
        for item in evaluation_contract.get("metrics") or []
        if isinstance(item, dict) and item.get("id")
    }
    criterion_rewards = {key: value for key, value in rewards.items() if key != primary_metric}
    if not criterion_rewards:
        criterion_rewards = rewards
    evaluator_result = evaluator_result or {}
    evaluator_criteria = {
        str(item.get("id")): item
        for item in evaluator_result.get("criteria") or []
        if isinstance(item, dict) and item.get("id")
    }
    criteria = [
        {
            "id": key,
            "label": metric_labels.get(key, key),
            "score": value,
            "status": "measured",
            "evidence_refs": [item["id"] for item in evidence_provenance],
            **(
                {
                    "reason": str(evaluator_criteria[key].get("reason") or ""),
                    "recommendation": str(evaluator_criteria[key].get("recommendation") or ""),
                    "recommendation_source": "evaluator",
                }
                if key in evaluator_criteria
                else {}
            ),
        }
        for key, value in sorted(criterion_rewards.items())
    ]
    recommendations = [
        {
            "criterion_id": item["id"],
            "message": item["recommendation"],
            "source": item["recommendation_source"],
        }
        for item in criteria
        if item.get("recommendation")
    ]
    recommendations.extend(
        item if isinstance(item, dict) else {"message": str(item), "source": "evaluator"}
        for item in evaluator_result.get("recommendations") or []
    )
    findings = [
        {
            "code": reason.upper().replace(":", "_"),
            "classification": "infrastructure" if "infrastructure" in reason else "evaluation-validity",
            "message": "This Trial cannot contribute a Candidate quality score.",
        }
        for reason in invalid_reasons
    ]
    if exception:
        status = "infrastructure-error"
    elif verifier is None:
        status = "evaluation-error"
    elif not valid:
        status = "candidate-quality-failed"
    else:
        status = "completed"

    process = []
    for stage in ("environment_setup", "agent_setup", "agent_execution", "verifier"):
        value = payload.get(stage)
        if not isinstance(value, dict):
            continue
        process.append(
            {
                "stage": stage,
                "started_at": value.get("started_at"),
                "finished_at": value.get("finished_at"),
                "status": "completed" if value.get("finished_at") else "running",
            }
        )
    population = task.get("metadata") if isinstance(task.get("metadata"), dict) else {}
    return redact(
        {
            "schema_version": 2,
            "trial_id": str(payload.get("id") or payload.get("trial_name") or "unknown"),
            "trial_name": str(payload.get("trial_name") or "unknown"),
            "dataset_trial": str(payload.get("task_name") or task.get("id") or "unknown"),
            "query": query,
            "population": population,
            "status": status,
            "score": {"value": score_value, "valid": valid, "invalid_reasons": invalid_reasons},
            "requirements": requirements,
            "criteria": criteria,
            "findings": findings,
            "recommendations": recommendations,
            "raw_rewards": rewards,
            "output": output,
            "evidence_provenance": evidence_provenance,
            "exception": (
                {
                    "type": str(exception.get("exception_type") or "Exception"),
                    "classification": "infrastructure",
                    "message": "Execution failed. Inspect the local Harbor Trial log for authorized diagnostics.",
                }
                if exception
                else None
            ),
            "process": process,
        }
    )


def _safe_name(value: str, fallback: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip(".-") or fallback


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(redact(value), ensure_ascii=False, indent=2) + "\n")


def _optimization_report(
    assessments: list[dict[str, Any]],
    stack_manifest: dict[str, Any] | None,
    evaluation_contract: dict[str, Any],
) -> dict[str, Any]:
    affected = [item["trial_id"] for item in assessments if not item["score"]["valid"]]
    hypotheses = []
    if affected:
        hypotheses.append(
            {
                "id": "investigate-invalid-trials",
                "evidence_refs": [f"trial-assessments/{trial}.json" for trial in affected[:20]],
                "root_cause": "unclassified-invalid-trials",
                "affected_trials": affected,
                "expected_metric_effect": "Restore trustworthy metric coverage before attempting Candidate optimization.",
                "mutation_surface": [],
                "forbidden_surface": ["evaluation-contract", "dataset-ground-truth", "promotion-policy"],
                "guardrails": ["Do not convert infrastructure or evaluator failures into Candidate quality scores."],
                "rollback_condition": "Any change reduces valid score coverage or changes Evaluation Context.",
                "next_experiment": "Classify one invalid Trial, fix only its owning layer, then rerun a diagnostic Job.",
            }
        )
    else:
        primary = str(evaluation_contract.get("primary_metric") or "")
        directions = {
            str(item.get("id")): item.get("direction")
            for item in evaluation_contract.get("metrics") or []
            if isinstance(item, dict) and item.get("id")
        }
        metric_values: dict[str, list[tuple[str, float]]] = defaultdict(list)
        for assessment in assessments:
            if not assessment["score"]["valid"]:
                continue
            for metric, value in assessment["raw_rewards"].items():
                if metric != primary:
                    metric_values[metric].append((assessment["trial_id"], value))
        normalized = {
            metric: values
            for metric, values in metric_values.items()
            if directions.get(metric, "maximize") == "maximize"
            and values
            and all(0 <= value <= 1 for _, value in values)
        }
        if normalized:
            weakest, values = min(
                normalized.items(),
                key=lambda item: mean(value for _, value in item[1]),
            )
            average = mean(value for _, value in values)
            if average < 1:
                weak_trials = [trial for trial, value in values if value <= average]
                hypotheses.append(
                    {
                        "id": f"improve-{_safe_name(weakest, 'weakest-metric')}",
                        "evidence_refs": [f"trial-assessments/{trial}.json" for trial in weak_trials[:20]],
                        "root_cause": f"candidate-quality:{weakest}",
                        "affected_trials": weak_trials,
                        "expected_metric_effect": f"Improve {weakest} without reducing valid score coverage or non-regression metrics.",
                        "mutation_surface": [],
                        "forbidden_surface": ["evaluation-contract", "dataset-ground-truth", "evaluator", "rubric", "promotion-policy"],
                        "guardrails": [
                            "Confirm the failure is Candidate-owned before selecting files to change.",
                            "Make one controlled Candidate change and preserve Context comparability.",
                        ],
                        "rollback_condition": f"{weakest} or any protected metric regresses, or score validity coverage decreases.",
                        "next_experiment": f"Open evidence for the weakest dimension {weakest}, choose one Candidate-owned mutation surface, and run one comparable diagnostic Job.",
                    }
                )
    optimizer = ((stack_manifest or {}).get("components") or {}).get("optimizer") or {}
    return {
        "schema_version": 2,
        "hook": {
            "id": "harbor-dsh-deterministic-optimizer",
            "version": "0.6.0",
            "reward_affecting": False,
            "status": "completed",
            "configured_component": {
                "id": optimizer.get("id"),
                "version": optimizer.get("version"),
                "executed": False,
            },
        },
        "hypotheses": hypotheses,
    }


def _diagnosis_report(
    assessments: list[dict[str, Any]], stack_manifest: dict[str, Any] | None
) -> dict[str, Any]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for assessment in assessments:
        for reason in assessment["score"]["invalid_reasons"]:
            grouped[reason].append(assessment["trial_id"])
    diagnoser = ((stack_manifest or {}).get("components") or {}).get("diagnoser") or {}
    return {
        "schema_version": 1,
        "hook": {
            "id": "harbor-dsh-deterministic-diagnoser",
            "version": "0.6.0",
            "reward_affecting": False,
            "status": "completed",
            "configured_component": {
                "id": diagnoser.get("id"),
                "version": diagnoser.get("version"),
                "executed": False,
            },
        },
        "diagnoses": [
            {
                "root_cause": reason,
                "classification": (
                    "infrastructure" if "infrastructure" in reason else "evaluation-validity"
                ),
                "affected_trials": trials,
                "evidence_refs": [f"trial-assessments/{trial}.json" for trial in trials],
            }
            for reason, trials in sorted(grouped.items())
        ],
    }


def _registry(job_dir: Path, assessment_paths: list[Path]) -> dict[str, Any]:
    specs = [
        ("candidate", "Candidate Manifest", "candidate-manifest.json", 1, False),
        ("dataset", "Dataset Manifest", "dataset-manifest.json", 1, False),
        ("dataset", "Dataset Preview", "dataset-preview.json", 1, False),
        ("evaluation-stack", "Evaluation Stack", "evaluation-stack-manifest.json", 1, True),
        ("evaluation-stack", "Evaluation Context", "evaluation-context.json", 2, True),
        ("evaluation-stack", "Evaluation Contract", "evaluation-contract.json", 1, True),
        ("reporter", "Population Report", "population-report.json", 2, False),
        ("diagnoser", "Diagnosis Report", "diagnosis-report.json", 1, False),
        ("optimizer", "Optimization Report", "optimization-report.json", 2, False),
        ("runner", "Trial Lifecycle", "trial-lifecycle.json", 1, False),
    ]
    for assessment in assessment_paths:
        specs.append(("judge", "Trial Assessment", str(assessment.relative_to(job_dir)), 2, True))
    return {
        "schema_version": 1,
        "artifacts": [
            {
                "role": role,
                "artifact": artifact,
                "path": relative,
                "schema": f"v{version}",
                "reward_affecting": reward_affecting,
                "status": "registered" if (job_dir / relative).is_file() else "unavailable",
            }
            for role, artifact, relative, version, reward_affecting in specs
        ],
    }


def write_job_artifacts(
    job_dir: Path,
    payloads: Iterable[dict[str, Any]],
    *,
    evaluation_contract: dict[str, Any],
    dataset_manifest: dict[str, Any] | None = None,
    stack_manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payloads = list(payloads)
    contract = {"schema_version": 1, **evaluation_contract}
    _write_json(job_dir / "evaluation-contract.json", contract)
    task_lookup = {
        str(task.get("id")): task
        for task in (dataset_manifest or {}).get("tasks", [])
        if isinstance(task, dict) and task.get("id")
    }
    assessment_dir = job_dir / "trial-assessments"
    assessment_dir.mkdir(exist_ok=True)
    assessments: list[dict[str, Any]] = []
    assessment_paths: list[Path] = []
    for index, payload in enumerate(payloads):
        payload = {
            **payload,
            "captured_output": _captured_agent_output(payload, job_dir),
            "evaluator_result": _evaluator_result(payload, job_dir),
            "evaluator_interface": (((stack_manifest or {}).get("components") or {}).get("evaluator") or {}).get("interface"),
        }
        assessment = trial_assessment(
            payload,
            evaluation_contract=evaluation_contract,
            task=_task_for(payload, task_lookup),
        )
        assessments.append(assessment)
        name = _safe_name(assessment["trial_id"], f"trial-{index + 1}")
        target = assessment_dir / f"{name}.json"
        if target.exists():
            target = assessment_dir / f"{name}-attempt-{index + 1}.json"
        _write_json(target, assessment)
        assessment_paths.append(target)

    metrics: dict[str, list[float]] = defaultdict(list)
    statuses = Counter(item["status"] for item in assessments)
    for assessment in assessments:
        if not assessment["score"]["valid"]:
            continue
        for key, value in assessment["raw_rewards"].items():
            metrics[key].append(value)
    configured_groups = evaluation_contract.get("groups") or []
    groups: list[dict[str, Any]] = []
    for group in configured_groups:
        if not isinstance(group, dict) or not group.get("id") or not group.get("field"):
            continue
        buckets = Counter()
        for assessment in assessments:
            value: Any = assessment
            for part in str(group["field"]).split("."):
                value = value.get(part) if isinstance(value, dict) else None
            buckets[str(value) if value is not None else "unknown"] += 1
        groups.append(
            {
                "id": str(group["id"]),
                "label": group.get("label") or str(group["id"]),
                "field": str(group["field"]),
                "count": len(assessments),
                "values": [{"value": key, "count": count} for key, count in sorted(buckets.items())],
            }
        )
    if not groups:
        groups = [{"id": status, "count": count} for status, count in sorted(statuses.items())]
    population = {
        "schema_version": 2,
        "hook": {
            "id": "harbor-dsh-population-reporter",
            "version": "0.6.0",
            "reward_affecting": False,
            "status": "completed",
            "configured_component": {
                "id": ((stack_manifest or {}).get("components") or {}).get("reporter", {}).get("id"),
                "version": ((stack_manifest or {}).get("components") or {}).get("reporter", {}).get("version"),
                "executed": False,
            },
        },
        "population_size": len(assessments),
        "valid_population_size": sum(item["score"]["valid"] for item in assessments),
        "invalid_population_size": sum(not item["score"]["valid"] for item in assessments),
        "groups": groups,
        "metrics": {key: mean(values) for key, values in sorted(metrics.items())},
    }
    _write_json(job_dir / "population-report.json", population)
    _write_json(job_dir / "diagnosis-report.json", _diagnosis_report(assessments, stack_manifest))
    _write_json(
        job_dir / "optimization-report.json",
        _optimization_report(assessments, stack_manifest, evaluation_contract),
    )
    _write_json(job_dir / "artifact-registry.json", _registry(job_dir, assessment_paths))
    return validate_job_artifacts(job_dir, expected_trials=len(assessments))


def _validate_versioned(name: str, value: dict[str, Any]) -> list[str]:
    if name == "trial-assessment.json" and value.get("schema_version") == 1:
        required = {"trial_id", "trial_name", "status", "rewards", "findings", "evidence", "process"}
        return [] if required.issubset(value) else ["legacy Trial Assessment v1 is incomplete"]
    if name == "population-report.json" and value.get("schema_version") == 1:
        required = {"population_size", "groups", "metrics"}
        return [] if required.issubset(value) else ["legacy Population Report v1 is incomplete"]
    schema_name = "trial-assessment-v2.json" if name == "trial-assessment.json" else name
    return _schema_errors(schema_name, value)


def validate_job_artifacts(job_dir: Path, *, expected_trials: int | None = None) -> dict[str, Any]:
    findings: list[dict[str, str]] = []
    required = (
        "evaluation-contract.json",
        "population-report.json",
        "artifact-registry.json",
        "diagnosis-report.json",
    )
    dataset_preview = job_dir / "dataset-preview.json"
    if dataset_preview.is_file():
        try:
            preview_errors = _validate_versioned("dataset-preview.json", json.loads(dataset_preview.read_text()))
            for error in preview_errors:
                findings.append({"level": "error", "code": "DATASET_PREVIEW_INVALID", "message": error})
        except json.JSONDecodeError:
            findings.append({"level": "error", "code": "DATASET_PREVIEW_INVALID", "message": "dataset-preview.json is not valid JSON"})
    optional = ("optimization-report.json", "promotion-report.json")
    for name in (*required, *optional):
        path = job_dir / name
        if not path.is_file():
            if name in required:
                findings.append({"level": "error", "code": "ARTIFACT_MISSING", "message": f"{name} is missing"})
            continue
        try:
            value = json.loads(path.read_text())
            errors = _validate_versioned(name, value)
            if errors:
                raise ValueError("; ".join(errors[:3]))
        except (json.JSONDecodeError, ValueError) as error:
            findings.append({"level": "error", "code": "ARTIFACT_SCHEMA_INVALID", "message": f"{name}: {error}"})
    assessments = list((job_dir / "trial-assessments").glob("*.json")) if (job_dir / "trial-assessments").is_dir() else []
    if expected_trials is not None and len(assessments) != expected_trials:
        findings.append({"level": "error", "code": "TRIAL_ASSESSMENT_COUNT_MISMATCH", "message": "Trial assessment count does not match Job trials"})
    for path in assessments:
        try:
            value = json.loads(path.read_text())
            errors = _validate_versioned("trial-assessment.json", value)
            if errors:
                raise ValueError("; ".join(errors[:3]))
        except (json.JSONDecodeError, ValueError) as error:
            findings.append({"level": "error", "code": "ARTIFACT_SCHEMA_INVALID", "message": f"trial-assessments/{path.name}: {error}"})
    return {
        "valid": not any(item["level"] == "error" for item in findings),
        "checked": len(required) + int(dataset_preview.is_file()) + sum((job_dir / name).is_file() for name in optional) + len(assessments),
        "findings": findings,
    }
