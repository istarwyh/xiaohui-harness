from __future__ import annotations

import json
from pathlib import Path

import pytest

from harbor_dsh_evolution.candidate import snapshot_candidate
from harbor_dsh_evolution.context import normalize_candidate_model_binding


def _candidate(root: Path) -> Path:
    root.mkdir()
    (root / "cordis.yml").write_text("- id: acp-agent\n  name: app\n")
    (root / "package.json").write_text(
        json.dumps({"name": "candidate", "version": "1.0.0"}) + "\n"
    )
    (root / "package-lock.json").write_text('{"lockfileVersion":3}\n')
    return root


def test_candidate_rejects_reserved_runtime_state(tmp_path: Path) -> None:
    candidate = _candidate(tmp_path / "candidate")
    (candidate / ".harbor-runtime").mkdir()
    with pytest.raises(ValueError, match=r"reserved \.harbor-runtime path"):
        snapshot_candidate(candidate)


def test_model_binding_is_normalized_and_requires_the_transport_contract() -> None:
    assert normalize_candidate_model_binding(
        {
            "provider": " openai-codex ",
            "model": " gpt-test ",
            "reasoning_effort": " high ",
            "transport": " xiaohui-host-broker ",
            "protocol": " xiaohui-model-gateway/v1 ",
        }
    ) == {
        "provider": "openai-codex",
        "model": "gpt-test",
        "transport": "xiaohui-host-broker",
        "protocol": "xiaohui-model-gateway/v1",
        "reasoning_effort": "high",
    }
    with pytest.raises(ValueError, match="requires provider, model, transport, and protocol"):
        normalize_candidate_model_binding(
            {"provider": "openai-codex", "model": "gpt-test"}
        )
