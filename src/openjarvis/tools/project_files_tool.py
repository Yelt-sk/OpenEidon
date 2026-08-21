"""Project file tools stored in the workspace-level ``His-projects`` folder."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_ALLOWED_EXTENSIONS = {".html", ".css", ".js", ".py", ".ts"}


def _projects_dir() -> Path:
    return Path(__file__).resolve().parents[4] / "His-projects"


def _safe_project_name(value: str) -> str:
    cleaned = "".join(ch for ch in value.strip() if ch not in '<>:"/\\|?*').strip().rstrip(".")
    return cleaned or "project"


def _resolve_project_path(project_name: str, filename: str) -> tuple[Path | None, str | None]:
    safe_project = _safe_project_name(project_name)
    raw_name = Path(filename or "").name
    if not raw_name:
        return None, "No filename provided."
    suffix = Path(raw_name).suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(_ALLOWED_EXTENSIONS))
        return None, f"Unsupported file type: {suffix or '(none)'}. Allowed: {allowed}."

    project_dir = _projects_dir() / safe_project
    path = project_dir / raw_name
    return path, None


def _resolve_direct_path(raw_path: str) -> tuple[Path | None, str | None]:
    if not raw_path:
        return None, "No path provided."

    candidate = Path(raw_path)
    try:
        resolved = candidate.resolve()
    except OSError as exc:
        return None, f"Invalid path: {exc}"

    projects_dir = _projects_dir().resolve()
    try:
        resolved.relative_to(projects_dir)
    except ValueError:
        return None, f"Path must stay inside {projects_dir}"

    suffix = resolved.suffix.lower()
    if suffix not in _ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(_ALLOWED_EXTENSIONS))
        return None, f"Unsupported file type: {suffix or '(none)'}. Allowed: {allowed}."

    return resolved, None


def _resolve_any_project_path(params: dict[str, Any]) -> tuple[Path | None, str | None]:
    raw_path = str(params.get("path", "") or "").strip()
    if raw_path:
        return _resolve_direct_path(raw_path)

    project_name = (params.get("project_name", "") or "").strip()
    filename = (params.get("filename", "") or "").strip()
    if not project_name:
        return None, "No project_name or path provided."
    return _resolve_project_path(project_name, filename)


@ToolRegistry.register("create_project_file")
class CreateProjectFileTool(BaseTool):
    tool_id = "create_project_file"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="create_project_file",
            description=(
                "Create or overwrite a code file inside the Jarvis/His-projects folder. "
                "Supported file types: html, css, js, py, ts."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "project_name": {"type": "string", "description": "Project folder name inside Jarvis/His-projects."},
                    "filename": {"type": "string", "description": "Code filename, for example index.html or main.py."},
                    "path": {"type": "string", "description": "Absolute path inside D:\\projects\\Jarvis\\His-projects."},
                    "content": {"type": "string", "description": "Full file content to write."},
                },
                "required": ["content"],
            },
            category="filesystem",
        )

    def execute(self, **params: Any) -> ToolResult:
        content = params.get("content")
        if content is None:
            return ToolResult(tool_name=self.tool_id, content="No content provided.", success=False)

        path, error = _resolve_any_project_path(params)
        if error:
            return ToolResult(tool_name=self.tool_id, content=error, success=False)

        assert path is not None
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(content), encoding="utf-8")
        return ToolResult(
            tool_name=self.tool_id,
            content=f"Saved project file to {path}",
            success=True,
            metadata={"path": str(path), "project_name": path.parent.name, "filename": path.name},
        )


@ToolRegistry.register("list_project_files")
class ListProjectFilesTool(BaseTool):
    tool_id = "list_project_files"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="list_project_files",
            description="List projects or files stored in the Jarvis/His-projects folder.",
            parameters={
                "type": "object",
                "properties": {
                    "project_name": {
                        "type": "string",
                        "description": "Optional project folder name. If omitted, lists all projects.",
                    }
                },
            },
            category="filesystem",
        )

    def execute(self, **params: Any) -> ToolResult:
        projects_dir = _projects_dir()
        projects_dir.mkdir(parents=True, exist_ok=True)
        project_name = (params.get("project_name", "") or "").strip()

        if not project_name:
            projects = sorted(p.name for p in projects_dir.iterdir() if p.is_dir())
            content = "\n".join(projects) if projects else "No projects found."
            return ToolResult(tool_name=self.tool_id, content=content, success=True)

        project_dir = projects_dir / _safe_project_name(project_name)
        if not project_dir.exists() or not project_dir.is_dir():
            return ToolResult(tool_name=self.tool_id, content=f"Project not found: {project_name}", success=False)

        files = sorted(
            str(path.relative_to(project_dir)).replace("\\", "/")
            for path in project_dir.rglob("*")
            if path.is_file() and path.suffix.lower() in _ALLOWED_EXTENSIONS
        )
        content = "\n".join(files) if files else "No project files found."
        return ToolResult(tool_name=self.tool_id, content=content, success=True)


@ToolRegistry.register("read_project_file")
class ReadProjectFileTool(BaseTool):
    tool_id = "read_project_file"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="read_project_file",
            description="Read a project code file from Jarvis/His-projects.",
            parameters={
                "type": "object",
                "properties": {
                    "project_name": {"type": "string", "description": "Project folder name."},
                    "filename": {"type": "string", "description": "Code filename to read."},
                    "path": {"type": "string", "description": "Absolute path inside D:\\projects\\Jarvis\\His-projects."},
                },
            },
            category="filesystem",
        )

    def execute(self, **params: Any) -> ToolResult:
        filename = (params.get("filename", "") or "").strip()
        path, error = _resolve_any_project_path(params)
        if error:
            return ToolResult(tool_name=self.tool_id, content=error, success=False)

        assert path is not None
        if not path.exists():
            return ToolResult(tool_name=self.tool_id, content=f"Project file not found: {filename}", success=False)
        return ToolResult(
            tool_name=self.tool_id,
            content=path.read_text(encoding="utf-8"),
            success=True,
            metadata={"path": str(path), "project_name": path.parent.name, "filename": path.name},
        )


@ToolRegistry.register("open_project_file")
class OpenProjectFileTool(BaseTool):
    tool_id = "open_project_file"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="open_project_file",
            description=(
                "Open a project file from Jarvis/His-projects using the system default application. "
                "Uses the exact real path from D:\\projects\\Jarvis\\His-projects."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "project_name": {"type": "string", "description": "Project folder name."},
                    "filename": {"type": "string", "description": "Code file to open."},
                    "path": {"type": "string", "description": "Absolute path inside D:\\projects\\Jarvis\\His-projects."},
                },
            },
            category="filesystem",
        )

    def execute(self, **params: Any) -> ToolResult:
        filename = (params.get("filename", "") or "").strip()
        path, error = _resolve_any_project_path(params)
        if error:
            return ToolResult(tool_name=self.tool_id, content=error, success=False)

        assert path is not None
        if not path.exists():
            return ToolResult(tool_name=self.tool_id, content=f"Project file not found: {filename}", success=False)

        try:
            os.startfile(str(path))
        except Exception as exc:
            return ToolResult(tool_name=self.tool_id, content=f"Failed to open project file: {exc}", success=False)

        return ToolResult(
            tool_name=self.tool_id,
            content=f"Opened project file {path}",
            success=True,
            metadata={"path": str(path), "project_name": path.parent.name, "filename": path.name},
        )


__all__ = ["CreateProjectFileTool", "ListProjectFilesTool", "ReadProjectFileTool", "OpenProjectFileTool"]
