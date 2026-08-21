"""memory_facts tool — let an agent remember and recall structured facts.

Backs the MEMORY sidebar section: people the user works with, projects they
are building, and preferences about how things should be done.
"""

from __future__ import annotations

import json
from typing import Any

from openeidon.core.registry import ToolRegistry
from openeidon.core.types import ToolResult
from openeidon.tools._stubs import BaseTool, ToolSpec

_ACTIONS = ("remember", "recall", "list", "forget")


@ToolRegistry.register("memory_facts")
class MemoryFactsTool(BaseTool):
    """Remember, recall, and forget structured facts."""

    tool_id = "memory_facts"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="memory_facts",
            description=(
                "Long-term memory for people, projects, and preferences."
                " Use 'remember' when the user states a durable fact about"
                " themselves, someone they work with, or how they want things"
                " done; 'recall' or 'list' to look facts up before answering."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": list(_ACTIONS),
                        "description": "What to do.",
                    },
                    "kind": {
                        "type": "string",
                        "enum": ["person", "project", "preference"],
                        "description": "Fact category (required for remember).",
                    },
                    "name": {
                        "type": "string",
                        "description": "Subject of the fact, e.g. a person's name.",
                    },
                    "detail": {
                        "type": "string",
                        "description": "What to remember about the subject.",
                    },
                    "query": {
                        "type": "string",
                        "description": "Search text for 'recall'.",
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional tags.",
                    },
                },
                "required": ["action"],
            },
            category="memory",
            requires_confirmation=False,
            timeout_seconds=15.0,
            required_capabilities=["memory:write"],
        )

    def execute(self, **params: Any) -> ToolResult:
        action = (params.get("action") or "").strip().lower()
        if action not in _ACTIONS:
            return ToolResult(
                tool_name="memory_facts",
                content=f"action must be one of {', '.join(_ACTIONS)}",
                success=False,
            )

        from openeidon.memory import get_fact_store

        store = get_fact_store()

        if action == "remember":
            kind = (params.get("kind") or "").strip()
            name = (params.get("name") or "").strip()
            if not kind or not name:
                return ToolResult(
                    tool_name="memory_facts",
                    content="'kind' and 'name' are required to remember a fact.",
                    success=False,
                )
            try:
                fact = store.upsert(
                    kind,
                    name,
                    detail=(params.get("detail") or "").strip(),
                    tags=params.get("tags") or [],
                )
            except ValueError as exc:
                return ToolResult(
                    tool_name="memory_facts", content=str(exc), success=False
                )
            return ToolResult(
                tool_name="memory_facts",
                content=f"Remembered {fact.kind} '{fact.name}'.",
                metadata={"fact": fact.to_dict()},
            )

        if action == "forget":
            name = (params.get("name") or "").strip()
            kind = (params.get("kind") or "").strip()
            if not kind or not name:
                return ToolResult(
                    tool_name="memory_facts",
                    content="'kind' and 'name' are required to forget a fact.",
                    success=False,
                )
            fact = store.find(kind, name)
            if fact is None:
                return ToolResult(
                    tool_name="memory_facts",
                    content=f"No {kind} named '{name}' is remembered.",
                    success=False,
                )
            store.delete(fact.id)
            return ToolResult(
                tool_name="memory_facts", content=f"Forgot {kind} '{name}'."
            )

        if action == "recall":
            query = (params.get("query") or params.get("name") or "").strip()
            if not query:
                return ToolResult(
                    tool_name="memory_facts",
                    content="'query' is required to recall.",
                    success=False,
                )
            facts = store.search(query)
        else:  # list
            facts = store.list(params.get("kind") or "")

        if not facts:
            return ToolResult(
                tool_name="memory_facts", content="Nothing remembered yet."
            )
        lines = [
            f"[{f.kind}] {f.name}" + (f" — {f.detail}" if f.detail else "")
            for f in facts
        ]
        return ToolResult(
            tool_name="memory_facts",
            content="\n".join(lines),
            metadata={"facts": json.loads(json.dumps([f.to_dict() for f in facts]))},
        )
