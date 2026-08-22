from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

EXCLUDED_DIRS = {".git", "node_modules", "__pycache__", ".venv"}
EXCLUDED_FILES = {".DS_Store"}


def canonical_digest(value: Any, *, namespace: str) -> str:
    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    digest = hashlib.sha256()
    digest.update(namespace.encode("utf-8"))
    digest.update(b"\0")
    digest.update(payload)
    return f"sha256:{digest.hexdigest()}"


def files_under(root: Path, *, excluded: Iterable[str] = ()) -> list[Path]:
    root = root.expanduser().resolve(strict=True)
    excluded_names = EXCLUDED_FILES | set(excluded)
    files: list[Path] = []
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if any(part in EXCLUDED_DIRS for part in relative.parts):
            continue
        if path.name in excluded_names:
            continue
        if path.is_symlink():
            raise ValueError(f"Symlinks are not allowed: {relative.as_posix()}")
        if path.is_file():
            files.append(path)
    return sorted(files, key=lambda item: item.relative_to(root).as_posix())


def tree_digest(
    root: Path, *, namespace: str, excluded: Iterable[str] = ()
) -> tuple[str, list[dict[str, Any]]]:
    root = root.expanduser().resolve(strict=True)
    inventory: list[dict[str, Any]] = []
    digest = hashlib.sha256()
    digest.update(namespace.encode("utf-8"))
    digest.update(b"\0")
    for path in files_under(root, excluded=excluded):
        relative = path.relative_to(root).as_posix()
        content = path.read_bytes()
        file_digest = hashlib.sha256(content).hexdigest()
        inventory.append(
            {"path": relative, "size": len(content), "sha256": file_digest}
        )
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(len(content)).encode("ascii"))
        digest.update(b"\0")
        digest.update(content)
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}", inventory


def resolve_inside(root: Path, value: str | Path, *, label: str) -> Path:
    root = root.expanduser().resolve(strict=True)
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    candidate = candidate.resolve(strict=True)
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"{label} must stay under the project root")
    return candidate


def public_relative(root: Path, path: Path) -> str:
    return path.resolve(strict=True).relative_to(root.resolve(strict=True)).as_posix()
