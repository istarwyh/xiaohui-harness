from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MANIFEST_NAME = "candidate-manifest.json"
_DIGEST_PREFIX = b"harbor-dsh-candidate-v1\0"
_EXCLUDED_DIRS = {".git", "node_modules", "__pycache__", ".harbor-runtime"}
_EXCLUDED_FILES = {MANIFEST_NAME, ".DS_Store"}
_DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
_LOCKFILES = ("package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb")
_CREDENTIAL_FILES = {
    "credentials.json",
    "service-account.json",
    "secrets.json",
    "secrets.yaml",
    "secrets.yml",
    "id_rsa",
    "id_ed25519",
}


@dataclass(frozen=True)
class CandidateFile:
    path: str
    size: int
    sha256: str


@dataclass(frozen=True)
class CandidateManifest:
    schema_version: int
    candidate_id: str
    version: str
    digest: str
    created_at: str
    runtime: dict[str, str]
    files: list[CandidateFile]
    metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "CandidateManifest":
        schema_version = int(value["schema_version"])
        if schema_version != 1:
            raise ValueError(f"Unsupported Candidate schema_version: {schema_version}")
        candidate_id = str(value["candidate_id"])
        version = str(value["version"])
        digest = str(value["digest"])
        if not candidate_id or not version:
            raise ValueError("Candidate id and version must not be empty")
        if not _DIGEST_PATTERN.fullmatch(digest):
            raise ValueError(f"Invalid Candidate digest: {digest}")
        return cls(
            schema_version=schema_version,
            candidate_id=candidate_id,
            version=version,
            digest=digest,
            created_at=str(value["created_at"]),
            runtime=dict(value["runtime"]),
            files=[CandidateFile(**item) for item in value["files"]],
            metadata=dict(value.get("metadata") or {}),
        )


def _candidate_files(candidate_dir: Path) -> list[Path]:
    paths: list[Path] = []
    for path in candidate_dir.rglob("*"):
        relative = path.relative_to(candidate_dir)
        if any(part in _EXCLUDED_DIRS for part in relative.parts):
            continue
        if path.name in _EXCLUDED_FILES:
            continue
        if path.is_symlink():
            raise ValueError(f"Candidate must not contain symlinks: {relative}")
        if path.is_file():
            paths.append(path)
    return sorted(paths, key=lambda item: item.relative_to(candidate_dir).as_posix())


def compute_candidate(candidate_dir: Path) -> tuple[str, list[CandidateFile]]:
    candidate_dir = candidate_dir.expanduser().resolve(strict=True)
    if not candidate_dir.is_dir():
        raise ValueError(f"Candidate path is not a directory: {candidate_dir}")

    digest = hashlib.sha256()
    digest.update(_DIGEST_PREFIX)
    files: list[CandidateFile] = []
    for path in _candidate_files(candidate_dir):
        relative = path.relative_to(candidate_dir).as_posix()
        content = path.read_bytes()
        file_digest = hashlib.sha256(content).hexdigest()
        files.append(
            CandidateFile(path=relative, size=len(content), sha256=file_digest)
        )
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(len(content)).encode("ascii"))
        digest.update(b"\0")
        digest.update(content)
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}", files


def _validate_candidate_contract(candidate_dir: Path) -> None:
    if (candidate_dir / ".harbor-runtime").exists():
        raise ValueError("Candidate must not contain the reserved .harbor-runtime path")
    missing = [
        name
        for name in ("cordis.yml", "package.json")
        if not (candidate_dir / name).is_file()
    ]
    if missing:
        raise ValueError(f"Candidate is missing required files: {', '.join(missing)}")
    if not any((candidate_dir / name).is_file() for name in _LOCKFILES):
        raise ValueError(
            "Candidate requires a JavaScript lockfile: " + ", ".join(_LOCKFILES)
        )
    credential_paths = sorted(
        path.relative_to(candidate_dir).as_posix()
        for path in candidate_dir.rglob("*")
        if path.is_file()
        and (path.name.casefold().startswith(".env") or path.name.casefold() in _CREDENTIAL_FILES)
    )
    if credential_paths:
        raise ValueError(
            "Candidate contains credential-bearing files: "
            + ", ".join(credential_paths)
            + "; inject credentials at runtime instead"
        )


def snapshot_candidate(
    candidate_dir: Path,
    *,
    candidate_id: str | None = None,
    version: str | None = None,
    runtime_version: str = "0.1.0-rc.6",
    metadata: dict[str, Any] | None = None,
) -> CandidateManifest:
    candidate_dir = candidate_dir.expanduser().resolve(strict=True)
    _validate_candidate_contract(candidate_dir)

    try:
        package = json.loads((candidate_dir / "package.json").read_text())
    except json.JSONDecodeError as error:
        raise ValueError("Candidate package.json is not valid JSON") from error
    if candidate_id is None:
        candidate_id = str(package.get("name") or "")
    if version is None:
        version = str(package.get("version") or "")
    if not candidate_id or not version or not runtime_version:
        raise ValueError(
            "Candidate id, version, and runtime version must not be empty; "
            "set package.json name/version or pass explicit values"
        )

    digest, files = compute_candidate(candidate_dir)
    manifest = CandidateManifest(
        schema_version=1,
        candidate_id=candidate_id,
        version=version,
        digest=digest,
        created_at=datetime.now(timezone.utc).isoformat(),
        runtime={
            "kind": "deepseek-harness",
            "version": runtime_version,
            "transport": "acp",
        },
        files=files,
        metadata=metadata or {},
    )
    (candidate_dir / MANIFEST_NAME).write_text(
        json.dumps(manifest.to_dict(), ensure_ascii=False, indent=2) + "\n"
    )
    return manifest


def load_manifest(candidate_dir: Path) -> CandidateManifest:
    path = candidate_dir.expanduser().resolve(strict=True) / MANIFEST_NAME
    return CandidateManifest.from_dict(json.loads(path.read_text()))


def verify_candidate(
    candidate_dir: Path,
    *,
    expected_digest: str | None = None,
) -> CandidateManifest:
    candidate_dir = candidate_dir.expanduser().resolve(strict=True)
    _validate_candidate_contract(candidate_dir)
    manifest = load_manifest(candidate_dir)
    actual_digest, actual_files = compute_candidate(candidate_dir)
    if actual_digest != manifest.digest:
        raise ValueError(
            "Candidate digest mismatch: "
            f"manifest={manifest.digest}, actual={actual_digest}"
        )
    if expected_digest is not None and actual_digest != expected_digest:
        raise ValueError(
            "Candidate does not match requested digest: "
            f"expected={expected_digest}, actual={actual_digest}"
        )
    if actual_files != manifest.files:
        raise ValueError("Candidate file inventory does not match its manifest")
    return manifest
