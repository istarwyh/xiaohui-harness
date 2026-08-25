from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from harbor_dsh_evolution.candidate import load_manifest, snapshot_candidate, verify_candidate
from harbor_dsh_evolution.context import context_preview
from harbor_dsh_evolution.dataset import snapshot_dataset, validate_dataset
from harbor_dsh_evolution.doctor import architecture_doctor
from harbor_dsh_evolution.evaluator import inspect_evaluator, update_evaluator_source
from harbor_dsh_evolution.initialize import initialize_project
from harbor_dsh_evolution.meta_evaluation import (
    initialize_ground_truth,
    load_ground_truth,
    run_meta_evaluation,
)
from harbor_dsh_evolution.promotion import compare_jobs, write_report
from harbor_dsh_evolution.quick import initialize_quick_diagnostic
from harbor_dsh_evolution.stack import snapshot_stack, validate_stack, write_stack_manifest
from harbor_dsh_evolution.summary import load_or_create_summary


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="harbor-dsh")
    commands = parser.add_subparsers(dest="command", required=True)

    snapshot = commands.add_parser("snapshot", help="Freeze a Candidate directory")
    snapshot.add_argument("candidate_dir", type=Path)
    snapshot.add_argument("--id", dest="candidate_id")
    snapshot.add_argument("--version")

    verify = commands.add_parser("verify", help="Verify a Candidate digest")
    verify.add_argument("candidate_dir", type=Path)
    verify.add_argument("--digest")

    summary = commands.add_parser("summarize", help="Summarize a Harbor Job")
    summary.add_argument("job_dir", type=Path)

    initialize = commands.add_parser("init", help="Initialize a strict Evaluation Stack project")
    initialize.add_argument("--project-root", required=True, type=Path)
    initialize.add_argument("--dataset", required=True, type=Path)
    initialize.add_argument("--stack-id", required=True)
    initialize.add_argument("--stack-version", required=True)
    initialize.add_argument("--dataset-id", required=True)
    initialize.add_argument("--dataset-version", required=True)
    initialize.add_argument("--contract-id", required=True)
    initialize.add_argument("--contract-version", required=True)
    initialize.add_argument("--primary-metric", required=True)
    initialize.add_argument("--primary-direction", required=True, choices=("maximize", "minimize"))
    initialize.add_argument("--judge-provider", required=True)
    initialize.add_argument("--judge-model", required=True)
    initialize.add_argument("--judge-version", required=True)
    initialize.add_argument("--policy-id", required=True)
    initialize.add_argument("--policy-version", required=True)
    initialize.add_argument("--min-improvement", required=True, type=float)
    initialize.add_argument("--workspace-subdir", default=".")

    quick = commands.add_parser("quick", help="Create an explicitly non-promotable wiring diagnostic")
    quick_commands = quick.add_subparsers(dest="quick_command", required=True)
    quick_diagnostic = quick_commands.add_parser("diagnostic")
    quick_diagnostic.add_argument("--project-root", required=True, type=Path)
    quick_diagnostic.add_argument("--query", required=True)
    quick_diagnostic.add_argument("--rubric", required=True)
    quick_diagnostic.add_argument("--workspace-subdir", default="harbor-diagnostic")

    dataset = commands.add_parser("dataset", help="Manage Dataset manifests")
    dataset_commands = dataset.add_subparsers(dest="dataset_command", required=True)
    dataset_snapshot = dataset_commands.add_parser("snapshot")
    dataset_snapshot.add_argument("dataset_dir", type=Path)
    dataset_snapshot.add_argument("--id", dest="dataset_id")
    dataset_snapshot.add_argument("--version", default="1.0.0")
    dataset_validate = dataset_commands.add_parser("validate")
    dataset_validate.add_argument("dataset_dir", type=Path)
    dataset_validate.add_argument("--project-root", required=True, type=Path)

    stack = commands.add_parser("stack", help="Manage Evaluation Stack manifests")
    stack_commands = stack.add_subparsers(dest="stack_command", required=True)
    stack_validate = stack_commands.add_parser("validate")
    stack_validate.add_argument("stack_path", type=Path)
    stack_validate.add_argument("--project-root", required=True, type=Path)
    stack_snapshot = stack_commands.add_parser("snapshot")
    stack_snapshot.add_argument("stack_path", type=Path)
    stack_snapshot.add_argument("--project-root", required=True, type=Path)
    stack_snapshot.add_argument("--output", type=Path)

    evaluator = commands.add_parser("evaluator", help="Inspect or update an Evaluator Interface")
    evaluator_commands = evaluator.add_subparsers(dest="evaluator_command", required=True)
    evaluator_inspect = evaluator_commands.add_parser("inspect")
    evaluator_inspect.add_argument("--project-root", required=True, type=Path)
    evaluator_inspect.add_argument("--stack", required=True, type=Path)
    evaluator_update = evaluator_commands.add_parser("update")
    evaluator_update.add_argument("--project-root", required=True, type=Path)
    evaluator_update.add_argument("--stack", required=True, type=Path)
    evaluator_update.add_argument("--file", required=True)
    evaluator_update.add_argument("--expected-digest", required=True)
    evaluator_update.add_argument("--new-evaluator-version", required=True)
    evaluator_update.add_argument("--new-stack-version", required=True)
    evaluator_update.add_argument("--content-stdin", action="store_true", required=True)

    ground_truth = commands.add_parser("ground-truth", help="Initialize or validate independent Ground Truth")
    ground_truth_commands = ground_truth.add_subparsers(dest="ground_truth_command", required=True)
    ground_truth_init = ground_truth_commands.add_parser("init")
    ground_truth_init.add_argument("--project-root", required=True, type=Path)
    ground_truth_init.add_argument("--output", default=".harbor/ground-truth.json", type=Path)
    ground_truth_init.add_argument("--id", dest="ground_truth_id", required=True)
    ground_truth_init.add_argument("--version", required=True)
    ground_truth_init.add_argument(
        "--source-kind",
        required=True,
        choices=("human", "programmatic", "consensus", "model", "external"),
    )
    ground_truth_init.add_argument("--source-description", required=True)
    ground_truth_init.add_argument("--provenance", required=True)
    ground_truth_init.add_argument("--criteria", required=True)
    ground_truth_validate = ground_truth_commands.add_parser("validate")
    ground_truth_validate.add_argument("path", type=Path)
    ground_truth_validate.add_argument("--project-root", required=True, type=Path)

    meta_evaluate = commands.add_parser("meta-evaluate", help="Compare repeated Evaluator observations with Ground Truth")
    meta_evaluate.add_argument("--project-root", required=True, type=Path)
    meta_evaluate.add_argument("--ground-truth", required=True, type=Path)
    meta_evaluate.add_argument("--observations", required=True, type=Path)
    meta_evaluate.add_argument("--output", default=".harbor/meta-evaluation-report.json", type=Path)

    preview = commands.add_parser("context", help="Preview Evaluation Context v2")
    preview_commands = preview.add_subparsers(dest="context_command", required=True)
    context_preview_parser = preview_commands.add_parser("preview")
    context_preview_parser.add_argument("--project-root", required=True, type=Path)
    context_preview_parser.add_argument("--candidate", required=True, type=Path)
    context_preview_parser.add_argument("--dataset", required=True, type=Path)
    context_preview_parser.add_argument("--stack", required=True, type=Path)
    context_preview_parser.add_argument("--jobs-dir", required=True, type=Path)
    context_preview_parser.add_argument("--mode", required=True, choices=("diagnostic", "promotion-eligible"))
    context_preview_parser.add_argument("--candidate-model-provider", required=True)
    context_preview_parser.add_argument("--candidate-model", required=True)
    context_preview_parser.add_argument("--candidate-reasoning-effort")
    context_preview_parser.add_argument("--candidate-model-transport", required=True)
    context_preview_parser.add_argument("--candidate-model-protocol", required=True)

    doctor = commands.add_parser("doctor", help="Validate evaluation architecture")
    doctor.add_argument("--architecture", action="store_true", required=True)
    doctor.add_argument("--project-root", required=True, type=Path)
    doctor.add_argument("--stack", required=True, type=Path)
    doctor.add_argument("--dataset", required=True, type=Path)
    doctor.add_argument("--candidate", type=Path)
    doctor.add_argument("--policy", type=Path)
    doctor.add_argument("--runtime", action="store_true")

    promote = commands.add_parser("promote", help="Apply a Promotion Gate")
    promote.add_argument("baseline_job", type=Path)
    promote.add_argument("candidate_job", type=Path)
    promote.add_argument("--policy", required=True, type=Path)
    promote.add_argument("--output", type=Path)
    return parser


def main() -> int:
    args = _parser().parse_args()
    exit_code = 0
    if args.command == "snapshot":
        result = snapshot_candidate(
            args.candidate_dir,
            candidate_id=args.candidate_id,
            version=args.version,
        ).to_dict()
    elif args.command == "verify":
        result = verify_candidate(args.candidate_dir, expected_digest=args.digest).to_dict()
    elif args.command == "summarize":
        result = load_or_create_summary(args.job_dir)
    elif args.command == "init":
        result = initialize_project(
            project_root=args.project_root,
            dataset_path=args.dataset,
            stack_id=args.stack_id,
            stack_version=args.stack_version,
            dataset_id=args.dataset_id,
            dataset_version=args.dataset_version,
            contract_id=args.contract_id,
            contract_version=args.contract_version,
            primary_metric=args.primary_metric,
            primary_direction=args.primary_direction,
            judge_provider=args.judge_provider,
            judge_model=args.judge_model,
            judge_version=args.judge_version,
            policy_id=args.policy_id,
            policy_version=args.policy_version,
            min_improvement=args.min_improvement,
            workspace_subdir=args.workspace_subdir,
        )
    elif args.command == "dataset":
        if args.dataset_command == "snapshot":
            result = snapshot_dataset(args.dataset_dir, dataset_id=args.dataset_id, version=args.version)
        else:
            result = validate_dataset(args.dataset_dir, project_root=args.project_root).to_dict()
            exit_code = 0 if result["valid"] else 2
    elif args.command == "quick":
        result = initialize_quick_diagnostic(
            project_root=args.project_root,
            query=args.query,
            rubric=args.rubric,
            workspace_subdir=args.workspace_subdir,
        )
    elif args.command == "stack":
        if args.stack_command == "validate":
            result = validate_stack(args.stack_path, project_root=args.project_root)
            result.pop("stack", None)
            exit_code = 0 if result["valid"] else 2
        else:
            result = snapshot_stack(args.stack_path, project_root=args.project_root)
            if args.output:
                write_stack_manifest(result, args.output)
    elif args.command == "evaluator":
        if args.evaluator_command == "inspect":
            result = inspect_evaluator(
                project_root=args.project_root,
                stack_path=args.stack,
                include_source=True,
            )
        else:
            result = update_evaluator_source(
                project_root=args.project_root,
                stack_path=args.stack,
                file_path=args.file,
                content=sys.stdin.read(),
                expected_digest=args.expected_digest,
                new_evaluator_version=args.new_evaluator_version,
                new_stack_version=args.new_stack_version,
            )
    elif args.command == "ground-truth":
        if args.ground_truth_command == "init":
            result = initialize_ground_truth(
                project_root=args.project_root,
                output_path=args.output,
                ground_truth_id=args.ground_truth_id,
                version=args.version,
                source_kind=args.source_kind,
                source_description=args.source_description,
                provenance=args.provenance,
                criteria=[item.strip() for item in args.criteria.split(",") if item.strip()],
            )
        else:
            _, result = load_ground_truth(args.path, project_root=args.project_root)
            exit_code = 0 if result["valid"] and result["ready"] else 2
    elif args.command == "meta-evaluate":
        result = run_meta_evaluation(
            project_root=args.project_root,
            ground_truth_path=args.ground_truth,
            observations_path=args.observations,
            output_path=args.output,
        )
    elif args.command == "context":
        candidate_dir = args.candidate
        candidate = load_manifest(candidate_dir) if candidate_dir.is_dir() else load_manifest(candidate_dir.parent)
        result = context_preview(
            project_root=args.project_root,
            candidate=candidate,
            dataset_dir=args.dataset,
            stack_path=args.stack,
            jobs_dir=args.jobs_dir,
            mode=args.mode,
            candidate_model_binding={
                "provider": args.candidate_model_provider,
                "model": args.candidate_model,
                "transport": args.candidate_model_transport,
                "protocol": args.candidate_model_protocol,
                **(
                    {"reasoning_effort": args.candidate_reasoning_effort}
                    if args.candidate_reasoning_effort
                    else {}
                ),
            },
        )
    elif args.command == "doctor":
        result = architecture_doctor(
            project_root=args.project_root,
            stack_path=args.stack,
            dataset_path=args.dataset,
            candidate_path=args.candidate,
            policy_path=args.policy,
            runtime_checks=args.runtime,
        )
        exit_code = 0 if result["promotion_ready"] else 2
    else:
        report = compare_jobs(args.baseline_job, args.candidate_job, args.policy)
        output = args.output or args.candidate_job / "promotion-report.json"
        write_report(report, output)
        result = report
        exit_code = 0 if report["decision"] == "PROMOTE" else 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
