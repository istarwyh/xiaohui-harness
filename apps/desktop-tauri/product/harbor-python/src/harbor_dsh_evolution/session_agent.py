from __future__ import annotations

import json
import shlex
from pathlib import Path
from typing import override

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


class SessionObservationAgent(BaseAgent):
    """Deterministically expose one frozen DSH Session Observation to Harbor."""

    OBSERVATION_PATH = "/opt/harbor-dsh/session-observation.json"
    ARTIFACT_PATH = "/logs/artifacts/session-observation.json"
    SUPPORTS_WINDOWS = False

    @staticmethod
    @override
    def name() -> str:
        return "dsh-session-observation-adapter"

    @override
    def version(self) -> str:
        return "1.0.0"

    @override
    async def setup(self, environment: BaseEnvironment) -> None:
        result = await environment.exec(
            "test -r /opt/harbor-dsh/session-observation.json "
            "&& mkdir -p /logs/artifacts "
            "&& chmod 0777 /logs/artifacts",
            user="root",
        )
        if result.return_code != 0:
            raise RuntimeError(
                "Frozen Session Observation is unavailable: "
                f"{result.stderr or result.stdout}"
            )

    @override
    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        del instruction
        code = r'''
import hashlib
import json
from pathlib import Path

source = Path("/opt/harbor-dsh/session-observation.json")
artifact = Path("/logs/artifacts/session-observation.json")
value = json.loads(source.read_text())
claimed = value.get("digest")
unsigned = {key: item for key, item in value.items() if key != "digest"}
canonical = json.dumps(unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
actual = "sha256:" + hashlib.sha256(b"harbor-dsh-session-observation-v1\0" + canonical).hexdigest()
if claimed != actual:
    raise RuntimeError("Session Observation digest mismatch")
artifact.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"status": "observed", "digest": actual}))
'''.strip()
        result = await environment.exec(
            f"python3 -c {shlex.quote(code)}",
            timeout_sec=30,
        )
        if result.return_code != 0:
            raise RuntimeError(
                "Session Observation adapter failed: "
                f"{result.stderr or result.stdout}"
            )
        try:
            output = json.loads(result.stdout.strip().splitlines()[-1])
        except (IndexError, json.JSONDecodeError) as error:
            raise RuntimeError("Session Observation adapter returned invalid output") from error
        context.metadata = {
            **(context.metadata or {}),
            "execution_adapter": {
                "id": self.name(),
                "version": self.version(),
                "execution_mode": "observe-existing",
                "model_invocation": False,
                "tool_reexecution": False,
            },
            "observation": {
                "digest": output["digest"],
                "artifact": self.ARTIFACT_PATH,
            },
        }
