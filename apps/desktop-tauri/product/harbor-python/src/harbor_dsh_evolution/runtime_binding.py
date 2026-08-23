from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


class JsExpression(str):
    """A Cordis ``!!js`` scalar preserved while generating a runtime overlay."""


class CordisLoader(yaml.SafeLoader):
    pass


class CordisDumper(yaml.SafeDumper):
    pass


CordisLoader.add_constructor(
    "tag:yaml.org,2002:js",
    lambda loader, node: JsExpression(loader.construct_scalar(node)),
)
CordisDumper.add_representer(
    JsExpression,
    lambda dumper, value: dumper.represent_scalar("tag:yaml.org,2002:js", value),
)


@dataclass(frozen=True)
class AcpEntry:
    name: str
    config: dict[str, Any]


def _inside(root: Path, path: Path) -> Path:
    resolved = path.resolve(strict=True)
    if resolved != root and root not in resolved.parents:
        raise ValueError(f"Cordis include leaves the Candidate directory: {path}")
    return resolved


def _load_entries(path: Path) -> list[dict[str, Any]]:
    value = yaml.load(path.read_text(), Loader=CordisLoader)
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ValueError(f"Candidate Cordis config must contain a top-level entry list: {path}")
    return value


def _patched_entry(entry: AcpEntry | None, patches: Any) -> AcpEntry | None:
    if not isinstance(patches, list):
        return entry
    current = entry
    for patch in patches:
        if not isinstance(patch, dict):
            continue
        inserted = patch.get("insert")
        if isinstance(inserted, list):
            for value in inserted:
                if isinstance(value, dict) and value.get("id") == "acp-agent":
                    current = AcpEntry(
                        name=str(value.get("name") or "@deepseek-ai/dsh-acp-demo"),
                        config=dict(value.get("config") or {}),
                    )
        if patch.get("id") != "acp-agent":
            continue
        if patch.get("disabled") is True:
            raise ValueError("Candidate Cordis config disables the acp-agent entry")
        if current is None and "config" not in patch:
            continue
        current = AcpEntry(
            name=str(patch.get("name") or (current.name if current else "@deepseek-ai/dsh-acp-demo")),
            config=dict(patch.get("config") if "config" in patch else current.config),
        )
    return current


def _resolve_acp_entry(root: Path, path: Path, active: set[Path]) -> AcpEntry | None:
    path = _inside(root, path)
    if path in active:
        raise ValueError(f"Candidate Cordis includes form a cycle at {path}")
    active.add(path)
    try:
        found: list[AcpEntry] = []
        for entry in _load_entries(path):
            if entry.get("id") == "acp-agent":
                found.append(
                    AcpEntry(
                        name=str(entry.get("name") or "@deepseek-ai/dsh-acp-demo"),
                        config=dict(entry.get("config") or {}),
                    )
                )
                continue
            if entry.get("name") not in {
                "@deepseek-ai/cordis-plugin-include",
                "cordis:include",
            }:
                continue
            include_config = entry.get("config")
            if not isinstance(include_config, dict):
                continue
            include_path = include_config.get("path")
            if not isinstance(include_path, str) or isinstance(include_path, JsExpression):
                continue
            child = _resolve_acp_entry(root, path.parent / include_path, active)
            child = _patched_entry(child, include_config.get("patches"))
            if child is not None:
                found.append(child)
        if len(found) > 1:
            raise ValueError(f"Candidate Cordis config resolves multiple acp-agent entries: {path}")
        return found[0] if found else None
    finally:
        active.remove(path)


def render_runtime_config(
    candidate_dir: Path,
    *,
    gateway_provider: str,
    model: str,
    gateway_plugin: str = "./.harbor-runtime/llm_gateway.mjs",
) -> str:
    root = candidate_dir.expanduser().resolve(strict=True)
    entry = _resolve_acp_entry(root, root / "cordis.yml", set())
    if entry is None:
        raise ValueError("Candidate Cordis config must resolve exactly one acp-agent entry")
    config = dict(entry.config)
    config["provider"] = gateway_provider
    config["model"] = model
    runtime = [
        {
            "id": "harbor-candidate-root",
            "name": "@deepseek-ai/cordis-plugin-include",
            "config": {
                "path": "../cordis.yml",
                "patches": [
                    {
                        "id": "acp-agent",
                        "name": entry.name,
                        "config": config,
                    },
                    {
                        "insert": [
                            {
                                "id": "harbor-model-gateway",
                                "name": gateway_plugin,
                                "config": {
                                    "provider": gateway_provider,
                                    "model": model,
                                    "endpoint": JsExpression("process.env.HSE_MODEL_GATEWAY_URL"),
                                    "tokenFile": JsExpression("process.env.HSE_MODEL_GATEWAY_TOKEN_FILE"),
                                    "modelInfoJson": JsExpression("process.env.HSE_MODEL_GATEWAY_INFO"),
                                },
                            }
                        ]
                    },
                ],
            },
        }
    ]
    return yaml.dump(
        runtime,
        Dumper=CordisDumper,
        allow_unicode=True,
        sort_keys=False,
        width=120,
    )
