from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from harbor_dsh_evolution.runtime_binding import CordisLoader, JsExpression, render_runtime_config


def _write_candidate(root: Path, cordis: str) -> None:
    root.mkdir()
    (root / "cordis.yml").write_text(cordis)


def test_runtime_config_preserves_agent_fields_and_replaces_model_route(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(
        candidate,
        """
- id: acp-agent
  name: '@deepseek-ai/dsh-acp-demo'
  config:
    provider: deepseek-official
    model: deepseek-v4-pro
    persistenceRoot: !!js process.env.DSH_SESSION_ROOT
    workspaceContext: false
""".lstrip(),
    )

    rendered = render_runtime_config(
        candidate,
        gateway_provider="xiaohui-host",
        model="gpt-test",
    )
    document = yaml.load(rendered, Loader=CordisLoader)
    patches = document[0]["config"]["patches"]
    agent = patches[0]
    gateway = patches[1]["insert"][0]

    assert document[0]["config"]["path"] == "../cordis.yml"
    assert agent["config"]["provider"] == "xiaohui-host"
    assert agent["config"]["model"] == "gpt-test"
    assert isinstance(agent["config"]["persistenceRoot"], JsExpression)
    assert gateway["name"] == "./.harbor-runtime/llm_gateway.mjs"
    assert isinstance(gateway["config"]["tokenFile"], JsExpression)


def test_runtime_config_resolves_an_include_overlay(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(
        candidate,
        """
- id: base
  name: '@deepseek-ai/cordis-plugin-include'
  config:
    path: ./base.yml
    patches:
      - id: acp-agent
        config:
          provider: deepseek-official
          model: deepseek-v4-flash
          workspaceContext: false
""".lstrip(),
    )
    (candidate / "base.yml").write_text(
        """
- id: acp-agent
  name: '@deepseek-ai/dsh-acp-demo'
  config:
    provider: deepseek-official
    model: deepseek-v4-pro
    workspaceContext:
      maxBytes: 65536
""".lstrip()
    )

    rendered = render_runtime_config(
        candidate,
        gateway_provider="xiaohui-host",
        model="gpt-test",
    )
    document = yaml.load(rendered, Loader=CordisLoader)
    config = document[0]["config"]["patches"][0]["config"]
    assert config == {
        "provider": "xiaohui-host",
        "model": "gpt-test",
        "workspaceContext": False,
    }


def test_runtime_config_rejects_a_missing_acp_agent(tmp_path: Path) -> None:
    candidate = tmp_path / "candidate"
    _write_candidate(candidate, "- id: other\n  name: ./other.mjs\n")
    with pytest.raises(ValueError, match="exactly one acp-agent"):
        render_runtime_config(
            candidate,
            gateway_provider="xiaohui-host",
            model="gpt-test",
        )
