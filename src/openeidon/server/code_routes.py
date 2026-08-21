"""/v1/code/* routes — OpenCode coding-agent bridge for the FOX UI AGENT mode.

Tasks run in OpenCode sessions rooted at a project directory. The directory
must resolve under the configured file roots (same allowlist the file tools
use), and OpenCode permission requests are proxied to the UI rather than
auto-approved.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from openeidon.connectors.opencode import (
    OpenCodeError,
    extract_text_reply,
    get_manager,
)

logger = logging.getLogger(__name__)

code_router = APIRouter()


class CodeTaskRequest(BaseModel):
    task: str
    directory: str
    model: str = ""
    session_id: str = ""


class CodePermissionRequest(BaseModel):
    session_id: str
    permission_id: str
    response: str  # "once" | "always" | "reject"


def _check_directory(raw: str) -> Path:
    from openeidon.server.routes import get_file_roots

    directory = Path(raw).expanduser()
    try:
        resolved = directory.resolve()
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Bad directory: {exc}") from exc
    if not resolved.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {resolved}")
    for root in get_file_roots():
        try:
            resolved.relative_to(root.resolve())
            return resolved
        except (ValueError, OSError):
            continue
    raise HTTPException(
        status_code=403,
        detail=(
            f"Directory {resolved} is outside the allowed file roots;"
            " add it via /v1/tools/file-roots first."
        ),
    )


@code_router.get("/v1/code/health")
async def code_health():
    manager = get_manager()
    return {
        "installed": manager.available(),
        "running": await asyncio.to_thread(manager.is_running),
    }


@code_router.post("/v1/code/task")
async def run_code_task(body: CodeTaskRequest):
    """Start a coding task; returns session_id immediately (task runs async)."""
    task = body.task.strip()
    if not task:
        raise HTTPException(status_code=400, detail="task is required")
    directory = _check_directory(body.directory)
    manager = get_manager()
    try:
        await asyncio.to_thread(manager.start)
        session_id = body.session_id
        if not session_id:
            session = await asyncio.to_thread(
                manager.create_session, directory, task[:80]
            )
            session_id = session.get("id", "")
        await asyncio.to_thread(
            lambda: manager.prompt(
                session_id,
                task,
                directory=directory,
                model=body.model or None,
                wait=False,
            )
        )
    except OpenCodeError as exc:
        logger.exception("OpenCode task failed to start")
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True, "session_id": session_id, "directory": str(directory)}


@code_router.get("/v1/code/sessions/{session_id}")
async def code_session_state(session_id: str):
    """Poll a session: status, latest reply, pending permissions, diff."""
    manager = get_manager()
    try:
        statuses = await asyncio.to_thread(manager.status)
        messages = await asyncio.to_thread(manager.messages, session_id)
        try:
            diff = await asyncio.to_thread(manager.diff, session_id)
        except OpenCodeError:
            diff = []
    except OpenCodeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    session_status = (
        statuses.get(session_id, {}) if isinstance(statuses, dict) else {}
    )
    permissions = []
    tool_activity = []
    for message in messages:
        for part in message.get("parts", []):
            ptype = part.get("type")
            if ptype == "permission" and part.get("state") == "pending":
                permissions.append(part)
            elif ptype == "tool":
                state = part.get("state", {})
                tool_activity.append(
                    {
                        "tool": part.get("tool", ""),
                        "status": state.get("status", ""),
                        "title": state.get("title", ""),
                    }
                )
    return {
        "session_id": session_id,
        "status": session_status,
        "reply": extract_text_reply(messages),
        "tool_activity": tool_activity[-25:],
        "pending_permissions": permissions,
        "diff": diff,
    }


@code_router.post("/v1/code/permission")
async def respond_code_permission(body: CodePermissionRequest):
    if body.response not in {"once", "always", "reject"}:
        raise HTTPException(
            status_code=400, detail="response must be once/always/reject"
        )
    manager = get_manager()
    try:
        await asyncio.to_thread(
            manager.respond_permission,
            body.session_id,
            body.permission_id,
            body.response,
        )
    except OpenCodeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True}


@code_router.post("/v1/code/sessions/{session_id}/abort")
async def abort_code_session(session_id: str):
    manager = get_manager()
    try:
        await asyncio.to_thread(manager.abort, session_id)
    except OpenCodeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True}
