from __future__ import annotations

import json
import os
import shlex
import tempfile
from pathlib import Path
from typing import override

from harbor.agents.installed.acp import AcpAgent, DistributionKind
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

from harbor_dsh_evolution.candidate import CandidateManifest, verify_candidate
from harbor_dsh_evolution.runtime_binding import render_runtime_config
from harbor_dsh_evolution.runtime_identity import DEFAULT_CANDIDATE_ACP_PACKAGE


def _required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"DSH Candidate model bridge requires {name}")
    return value


class DshCandidateAgent(AcpAgent):
    """Run one immutable DeepSeek Harness Candidate through Harbor's ACP runner."""

    _REMOTE_ROOT = "/opt/harbor-dsh-candidate"
    _GATEWAY_SECRET_PATH = "/run/secrets/hse-model-gateway-token"
    _RUNTIME_DIR = f"{_REMOTE_ROOT}/.harbor-runtime"
    _RUNTIME_CONFIG = f"{_RUNTIME_DIR}/cordis.yml"
    _GATEWAY_PLUGIN = f"{_RUNTIME_DIR}/llm_gateway.mjs"

    def __init__(
        self,
        logs_dir: Path,
        candidate_path: str,
        candidate_digest: str,
        candidate_version: str | None = None,
        candidate_model_provider: str | None = None,
        candidate_model: str | None = None,
        candidate_reasoning_effort: str | None = None,
        **kwargs,
    ) -> None:
        self.candidate_path = Path(candidate_path).expanduser().resolve(strict=True)
        self.manifest: CandidateManifest = verify_candidate(
            self.candidate_path, expected_digest=candidate_digest
        )
        if candidate_version is not None and candidate_version != self.manifest.version:
            raise ValueError(
                "Candidate version mismatch: "
                f"requested={candidate_version}, manifest={self.manifest.version}"
        )
        self.candidate_digest = candidate_digest
        self._candidate_acp_package = DEFAULT_CANDIDATE_ACP_PACKAGE
        self._model_binding = {
            "provider": str(candidate_model_provider or "").strip(),
            "model": str(candidate_model or "").strip(),
            **(
                {"reasoning_effort": candidate_reasoning_effort.strip()}
                if candidate_reasoning_effort and candidate_reasoning_effort.strip()
                else {}
            ),
            "transport": "dsh-host-broker",
            "protocol": _required_environment("HSE_MODEL_GATEWAY_PROTOCOL"),
        }
        if not self._model_binding["provider"] or not self._model_binding["model"]:
            raise ValueError("Candidate model provider and model are required")
        pinned_binding = self.manifest.metadata.get("model_binding")
        if isinstance(pinned_binding, dict):
            pinned_identity = {
                "provider": str(pinned_binding.get("provider") or "").strip(),
                "model": str(pinned_binding.get("model") or "").strip(),
                **(
                    {
                        "reasoning_effort": str(
                            pinned_binding["reasoning_effort"]
                        ).strip()
                    }
                    if pinned_binding.get("reasoning_effort")
                    else {}
                ),
            }
            runtime_identity = {
                key: self._model_binding[key]
                for key in ("provider", "model", "reasoning_effort")
                if key in self._model_binding
            }
            if pinned_identity != runtime_identity:
                raise ValueError(
                    "Candidate model-binding.json does not match the Host Broker "
                    "binding; create a new Candidate for a different model identity"
                )
        self._gateway_url = _required_environment("HSE_MODEL_GATEWAY_URL")
        self._gateway_token = _required_environment("HSE_MODEL_GATEWAY_TOKEN")
        self._gateway_provider = _required_environment("HSE_MODEL_GATEWAY_PROVIDER")
        self._gateway_info = _required_environment("HSE_MODEL_GATEWAY_INFO")
        try:
            gateway_info = json.loads(self._gateway_info)
        except json.JSONDecodeError as error:
            raise ValueError("HSE_MODEL_GATEWAY_INFO must be valid JSON") from error
        if gateway_info.get("id") != self._model_binding["model"]:
            raise ValueError("Candidate model binding does not match gateway model metadata")

        registry_entry = {
            "id": self.manifest.candidate_id,
            "name": f"DeepSeek Harness Candidate {self.manifest.candidate_id}",
            "version": self.manifest.version,
            "description": "Immutable Cordis composition evaluated through ACP.",
            "distribution": {
                "npx": {
                    "package": self._candidate_acp_package,
                    "args": ["--config", self._RUNTIME_CONFIG],
                    "env": {
                        "DSH_SESSION_ROOT": f"{self._REMOTE_ROOT}/.sessions",
                        "HSE_MODEL_GATEWAY_URL": self._gateway_url,
                        "HSE_MODEL_GATEWAY_TOKEN_FILE": self._GATEWAY_SECRET_PATH,
                        "HSE_MODEL_GATEWAY_INFO": self._gateway_info,
                    },
                }
            },
        }
        super().__init__(
            logs_dir=logs_dir,
            registry_entry=registry_entry,
            distribution_preference="npx",
            auth_policy="disabled",
            # This adapter only exposes an architecture-neutral npx distribution.
            # Supplying a supported platform avoids a best-effort uname probe on
            # deliberately minimal task images where that probe can be unavailable.
            target_platform="linux-x86_64",
            **kwargs,
        )

    @staticmethod
    @override
    def name() -> str:
        return "dsh-candidate"

    @override
    def version(self) -> str:
        return self.manifest.version

    @override
    def _build_dependencies_command(self, kind: DistributionKind) -> str:
        """Avoid network installation when the Task image is ACP-ready.

        Harbor's generic ACP installer supports arbitrary base images, but a
        stable evaluation image should pin these dependencies at build time.
        ``stdbuf`` is included because Harbor's ACP log pipeline requires it.
        """
        install = super()._build_dependencies_command(kind)
        return f"""
set -euo pipefail
if command -v bash >/dev/null 2>&1 \
  && command -v python3 >/dev/null 2>&1 \
  && command -v curl >/dev/null 2>&1 \
  && command -v node >/dev/null 2>&1 \
  && command -v npm >/dev/null 2>&1 \
  && command -v stdbuf >/dev/null 2>&1 \
  && [ -x {self._RUNNER_VENV_PATH}/bin/python ] \
  && {self._RUNNER_VENV_PATH}/bin/python -c 'import acp' >/dev/null 2>&1; then
  exit 0
fi
{install}
if ! command -v stdbuf >/dev/null 2>&1; then
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache coreutils
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get install -y coreutils
  fi
fi
""".strip()

    @override
    async def setup(self, environment: BaseEnvironment) -> None:
        await super().setup(environment)
        await environment.exec("mkdir -p /run/secrets", user="root")
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8") as secret:
            secret.write(self._gateway_token)
            secret.flush()
            await environment.upload_file(Path(secret.name), self._GATEWAY_SECRET_PATH)
        await environment.exec(
            f"chmod 600 {shlex.quote(self._GATEWAY_SECRET_PATH)}",
            user="root",
        )
        preflight_code = (
            "import json,sys,urllib.request;"
            "token=open(sys.argv[2], encoding='utf-8').read().strip();"
            "request=urllib.request.Request(sys.argv[1],headers={'Authorization':'Bearer '+token});"
            "reply=json.load(urllib.request.urlopen(request,timeout=10));"
            "assert reply.get('protocol')==sys.argv[3]"
        )
        preflight = await environment.exec(
            " ".join(
                [
                    "python3",
                    "-c",
                    shlex.quote(preflight_code),
                    shlex.quote(self._gateway_url),
                    shlex.quote(self._GATEWAY_SECRET_PATH),
                    shlex.quote(self._model_binding["protocol"]),
                ]
            ),
            user="root",
            timeout_sec=20,
        )
        if preflight.return_code != 0:
            raise RuntimeError(
                "Candidate cannot reach the DSH Host model gateway: "
                f"{preflight.stderr or preflight.stdout}"
            )
        await environment.exec(
            f"rm -rf {shlex.quote(self._REMOTE_ROOT)} && "
            f"mkdir -p {shlex.quote(self._REMOTE_ROOT)}",
            user="root",
        )
        await environment.upload_dir(self.candidate_path, self._REMOTE_ROOT)
        await environment.exec(
            f"mkdir -p {shlex.quote(self._RUNTIME_DIR)}", user="root"
        )
        await environment.upload_file(
            Path(__file__).with_name("llm_gateway.mjs"), self._GATEWAY_PLUGIN
        )
        runtime_config = render_runtime_config(
            self.candidate_path,
            gateway_provider=self._gateway_provider,
            model=self._model_binding["model"],
        )
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8") as runtime:
            runtime.write(runtime_config)
            runtime.flush()
            await environment.upload_file(Path(runtime.name), self._RUNTIME_CONFIG)

        package_command = (
            "npm ci" if (self.candidate_path / "package-lock.json").is_file()
            else "npm install"
        )
        install = await environment.exec(
            f"{package_command} --omit=dev --ignore-scripts --no-audit --no-fund",
            cwd=self._REMOTE_ROOT,
            user="root",
            timeout_sec=600,
        )
        if install.return_code != 0:
            raise RuntimeError(
                "Failed to install Candidate runtime dependencies: "
                f"{install.stderr or install.stdout}"
            )
        await environment.exec(
            f"chmod -R a+rX {shlex.quote(self._REMOTE_ROOT)}", user="root"
        )

    @override
    def populate_context_post_run(self, context: AgentContext) -> None:
        super().populate_context_post_run(context)
        metadata = dict(context.metadata or {})
        metadata["candidate"] = {
            "id": self.manifest.candidate_id,
            "version": self.manifest.version,
            "digest": self.candidate_digest,
            "runtime": self.manifest.runtime,
            "model_binding": self._model_binding,
        }
        context.metadata = metadata

        self.logs_dir.mkdir(parents=True, exist_ok=True)
        (self.logs_dir / "candidate.json").write_text(
            json.dumps(metadata["candidate"], ensure_ascii=False, indent=2) + "\n"
        )
