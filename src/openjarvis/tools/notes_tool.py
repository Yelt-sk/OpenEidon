"""Markdown notes tools stored in the workspace-level ``markdown`` folder."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


def _notes_dir() -> Path:
    return Path(__file__).resolve().parents[4] / "markdown"


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^\w\s-]", "", value, flags=re.UNICODE)
    value = re.sub(r"[-\s]+", "-", value, flags=re.UNICODE).strip("-")
    return value or "note"


@ToolRegistry.register("save_markdown_note")
class SaveMarkdownNoteTool(BaseTool):
    tool_id = "save_markdown_note"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="save_markdown_note",
            description=(
                "Save a markdown note into the Jarvis/markdown folder. "
                "Creates the folder if needed."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Note title."},
                    "content": {"type": "string", "description": "Markdown note body."},
                    "filename": {
                        "type": "string",
                        "description": "Optional filename without path. '.md' is added automatically if missing.",
                    },
                },
                "required": ["title", "content"],
            },
            category="filesystem",
        )

    def execute(self, **params: Any) -> ToolResult:
        title = (params.get("title", "") or "").strip()
        content = params.get("content", "")
        filename = (params.get("filename", "") or "").strip()
        if not title:
            return ToolResult(tool_name=self.tool_id, content="No title provided.", success=False)
        if content is None:
            return ToolResult(tool_name=self.tool_id, content="No content provided.", success=False)

        notes_dir = _notes_dir()
        notes_dir.mkdir(parents=True, exist_ok=True)
        base_name = filename or _slugify(title)
        if not base_name.lower().endswith(".md"):
            base_name += ".md"
        path = notes_dir / Path(base_name).name

        body = str(content).strip()
        if not body.startswith("# "):
            body = f"# {title}\n\n{body}\n"

        path.write_text(body, encoding="utf-8")
        return ToolResult(
            tool_name=self.tool_id,
            content=f"Saved note to {path}",
            success=True,
            metadata={"path": str(path), "title": title},
        )


@ToolRegistry.register("list_markdown_notes")
class ListMarkdownNotesTool(BaseTool):
    tool_id = "list_markdown_notes"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="list_markdown_notes",
            description="List markdown notes stored in the Jarvis/markdown folder.",
            parameters={"type": "object", "properties": {}},
            category="filesystem",
        )

    def execute(self, **params: Any) -> ToolResult:
        notes_dir = _notes_dir()
        notes_dir.mkdir(parents=True, exist_ok=True)
        files = sorted(notes_dir.glob("*.md"))
        if not files:
            return ToolResult(tool_name=self.tool_id, content="No markdown notes found.", success=True)
        content = "\n".join(f.name for f in files)
        return ToolResult(tool_name=self.tool_id, content=content, success=True)


@ToolRegistry.register("read_markdown_note")
class ReadMarkdownNoteTool(BaseTool):
    tool_id = "read_markdown_note"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="read_markdown_note",
            description="Read a markdown note from the Jarvis/markdown folder by filename.",
            parameters={
                "type": "object",
                "properties": {
                    "filename": {"type": "string", "description": "Filename of the note, with or without .md."}
                },
                "required": ["filename"],
            },
            category="filesystem",
        )

    def execute(self, **params: Any) -> ToolResult:
        filename = (params.get("filename", "") or "").strip()
        if not filename:
            return ToolResult(tool_name=self.tool_id, content="No filename provided.", success=False)
        if not filename.lower().endswith(".md"):
            filename += ".md"
        path = _notes_dir() / Path(filename).name
        if not path.exists():
            return ToolResult(tool_name=self.tool_id, content=f"Note not found: {filename}", success=False)
        return ToolResult(
            tool_name=self.tool_id,
            content=path.read_text(encoding="utf-8"),
            success=True,
            metadata={"path": str(path)},
        )


__all__ = ["ListMarkdownNotesTool", "ReadMarkdownNoteTool", "SaveMarkdownNoteTool"]
