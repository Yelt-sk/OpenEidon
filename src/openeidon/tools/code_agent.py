"""code_agent tool — delegate a coding task to OpenCode.

Wraps the OpenCode bridge (:mod:`openeidon.connectors.opencode`) as a
registry tool so orchestrator agents can hand off multi-step coding work
("fix the failing test in project X") to a dedicated coding agent and get
back the final answer plus the diff of changes.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from openeidon.core.registry import ToolRegistry
from openeidon.core.types import ToolResult
from openeidon.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("code_agent")
class CodeAgentTool(BaseTool):
    """Run a coding task in an OpenCode session rooted at a project directory."""

    tool_id = "code_agent"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="code_agent",
            description=(
                "Delegate a coding task to the OpenCode coding agent."
                " Provide the project directory and a clear task description;"
                " returns the agent's answer and a summary of file changes."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "The coding task to perform.",
                    },
                    "directory": {
                        "type": "string",
                        "description": "Absolute path of the project directory.",
                    },
                    "model": {
                        "type": "string",
                        "description": (
                            "Optional model override as 'provider/model-id'."
                        ),
                    },
                },
                "required": ["task", "directory"],
            },
            category="code",
            requires_confirmation=True,
            timeout_seconds=600.0,
            required_capabilities=["code:execute"],
        )

    def execute(self, **params: Any) -> ToolResult:
        task = (params.get("task") or "").strip()
        directory = (params.get("directory") or "").strip()
        model = (params.get("model") or "").strip() or None
        if not task or not directory:
            return ToolResult(
                tool_name="code_agent",
                content="Both 'task' and 'directory' are required.",
                success=False,
            )
        project = Path(directory).expanduser()
        if not project.is_dir():
            return ToolResult(
                tool_name="code_agent",
                content=f"Directory does not exist: {project}",
                success=False,
            )

        from openeidon.connectors.opencode import (
            OpenCodeError,
            extract_text_reply,
            get_manager,
        )

        manager = get_manager()
        started = time.monotonic()
        try:
            manager.start()
            session = manager.create_session(project, title=task[:80])
            session_id = session.get("id", "")
            manager.prompt(session_id, task, directory=project, model=model, wait=True)
            reply = extract_text_reply(manager.messages(session_id))
            try:
                diff = manager.diff(session_id)
            except OpenCodeError:
                diff = None
        except OpenCodeError as exc:
            return ToolResult(
                tool_name="code_agent",
                content=f"OpenCode failed: {exc}",
                success=False,
                latency_seconds=time.monotonic() - started,
            )

        changed: list[str] = []
        if isinstance(diff, list):
            changed = [d.get("file", "") for d in diff if isinstance(d, dict)]
        content = reply or "(no text reply from OpenCode)"
        if changed:
            listing = "\n".join(f"- {f}" for f in changed if f)
            content += "\n\nChanged files:\n" + listing
        return ToolResult(
            tool_name="code_agent",
            content=content,
            success=True,
            latency_seconds=time.monotonic() - started,
            metadata={"session_id": session_id, "changed_files": changed},
        )
