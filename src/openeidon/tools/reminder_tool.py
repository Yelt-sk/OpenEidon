"""Reminder tools backed by the local reminder manager."""

from __future__ import annotations

import json
from typing import Any

from openeidon.core.registry import ToolRegistry
from openeidon.core.types import ToolResult
from openeidon.reminders import get_default_reminder_manager
from openeidon.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("set_reminder")
class SetReminderTool(BaseTool):
    tool_id = "set_reminder"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="set_reminder",
            description=(
                "Set a local reminder. Use delay_seconds for 'in 10 minutes' style reminders, "
                "or due_at for an exact ISO datetime."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Reminder text to speak when due."},
                    "delay_seconds": {"type": "integer", "description": "Delay in seconds until the reminder fires."},
                    "due_at": {"type": "string", "description": "Exact ISO datetime for the reminder in local or UTC time."},
                },
                "required": ["text"],
            },
            category="scheduler",
        )

    def execute(self, **params: Any) -> ToolResult:
        manager = get_default_reminder_manager()
        if manager is None:
            return ToolResult(tool_name=self.tool_id, content="Reminder manager not available.", success=False)
        try:
            reminder = manager.create_reminder(
                params.get("text", ""),
                delay_seconds=params.get("delay_seconds"),
                due_at=params.get("due_at"),
            )
            return ToolResult(
                tool_name=self.tool_id,
                content=json.dumps(reminder.to_dict(), ensure_ascii=False),
                success=True,
            )
        except Exception as exc:
            return ToolResult(tool_name=self.tool_id, content=f"Failed to set reminder: {exc}", success=False)


@ToolRegistry.register("list_reminders")
class ListRemindersTool(BaseTool):
    tool_id = "list_reminders"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="list_reminders",
            description="List local reminders.",
            parameters={
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "Optional status filter: active, triggered, cancelled."}
                },
            },
            category="scheduler",
        )

    def execute(self, **params: Any) -> ToolResult:
        manager = get_default_reminder_manager()
        if manager is None:
            return ToolResult(tool_name=self.tool_id, content="Reminder manager not available.", success=False)
        reminders = [item.to_dict() for item in manager.list_reminders(status=params.get("status"))]
        return ToolResult(tool_name=self.tool_id, content=json.dumps(reminders, ensure_ascii=False), success=True)


@ToolRegistry.register("cancel_reminder")
class CancelReminderTool(BaseTool):
    tool_id = "cancel_reminder"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="cancel_reminder",
            description="Cancel a local reminder by reminder ID.",
            parameters={
                "type": "object",
                "properties": {
                    "reminder_id": {"type": "string", "description": "Reminder ID returned by set_reminder."}
                },
                "required": ["reminder_id"],
            },
            category="scheduler",
        )

    def execute(self, **params: Any) -> ToolResult:
        manager = get_default_reminder_manager()
        if manager is None:
            return ToolResult(tool_name=self.tool_id, content="Reminder manager not available.", success=False)
        try:
            reminder = manager.cancel_reminder((params.get("reminder_id", "") or "").strip())
            return ToolResult(tool_name=self.tool_id, content=json.dumps(reminder.to_dict(), ensure_ascii=False), success=True)
        except KeyError:
            return ToolResult(tool_name=self.tool_id, content="Reminder not found.", success=False)
        except Exception as exc:
            return ToolResult(tool_name=self.tool_id, content=f"Failed to cancel reminder: {exc}", success=False)


__all__ = ["CancelReminderTool", "ListRemindersTool", "SetReminderTool"]
