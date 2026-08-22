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


def _responses_environment() -> dict[str, str]:
    api_key = os.environ.get("HSE_DEMO_LLM_API_KEY", "").strip()
    return (
        {"HSE_RESPONSES_API_KEY_FILE": DshCandidateAgent._RESPONSES_SECRET_PATH}
        if api_key
        else {}
    )


class DshCandidateAgent(AcpAgent):
    """Run one immutable DeepSeek Harness Candidate through Harbor's ACP runner."""

    _REMOTE_ROOT = "/opt/harbor-dsh-candidate"
    _RESPONSES_SECRET_PATH = "/run/secrets/hse-responses-api-key"
    _DSH_ACP_PACKAGE = "@deepseek-ai/dsh-acp-demo@0.1.0-rc.6"

    def __init__(
        self,
        logs_dir: Path,
        candidate_path: str,
        candidate_digest: str,
        candidate_version: str | None = None,
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
        self._responses_api_key = os.environ.get("HSE_DEMO_LLM_API_KEY", "").strip()

        responses_environment = _responses_environment()

        registry_entry = {
            "id": self.manifest.candidate_id,
            "name": f"DeepSeek Harness Candidate {self.manifest.candidate_id}",
            "version": self.manifest.version,
            "description": "Immutable Cordis composition evaluated through ACP.",
            "distribution": {
                "npx": {
                    "package": self._DSH_ACP_PACKAGE,
                    "args": ["--config", f"{self._REMOTE_ROOT}/cordis.yml"],
                    "env": {
                        "DSH_SESSION_ROOT": f"{self._REMOTE_ROOT}/.sessions",
                        **responses_environment,
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
        if self._responses_api_key:
            await environment.exec("mkdir -p /run/secrets", user="root")
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8") as secret:
                secret.write(self._responses_api_key)
                secret.flush()
                await environment.upload_file(
                    Path(secret.name), self._RESPONSES_SECRET_PATH
                )
            await environment.exec(
                f"chmod 600 {shlex.quote(self._RESPONSES_SECRET_PATH)}",
                user="root",
            )
        await environment.exec(
            f"rm -rf {shlex.quote(self._REMOTE_ROOT)} && "
            f"mkdir -p {shlex.quote(self._REMOTE_ROOT)}",
            user="root",
        )
        await environment.upload_dir(self.candidate_path, self._REMOTE_ROOT)

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
        }
        context.metadata = metadata

        self.logs_dir.mkdir(parents=True, exist_ok=True)
        (self.logs_dir / "candidate.json").write_text(
            json.dumps(metadata["candidate"], ensure_ascii=False, indent=2) + "\n"
        )
