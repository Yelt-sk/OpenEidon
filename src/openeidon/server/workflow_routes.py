"""/v1/workflows — server-side persistence for the FOX workflow list.

Workflows used to live only in ``localStorage``, which meant a workflow
scheduled for 09:00 never fired unless the browser tab happened to be open.
Here they are stored as :class:`~openeidon.scheduler.scheduler.ScheduledTask`
rows so the existing scheduler owns the timing, and the UI shape is preserved
in the task metadata.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from openeidon.scheduler.scheduler import ScheduledTask, TaskScheduler
from openeidon.scheduler.store import SchedulerStore

logger = logging.getLogger(__name__)

workflow_router = APIRouter()

#: marks scheduler tasks that came from the workflow UI
WORKFLOW_SOURCE = "fox-workflow"

_REGULARITIES = ("once", "daily", "weekdays", "weekly", "monthly")


class WorkflowBody(BaseModel):
    id: str = ""
    name: str
    time: str = "09:00"
    regularity: str = "weekdays"
    weekdays: list[int] = []
    tools: list[str] = []
    instructions: str
    autonomy: int = 2
    enabled: bool = True


def _scheduler() -> TaskScheduler:
    """Lazily create a scheduler bound to the default store."""
    global _cached_scheduler
    if _cached_scheduler is None:
        db_path = Path.home() / ".openeidon" / "scheduler.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _cached_scheduler = TaskScheduler(SchedulerStore(db_path))
    return _cached_scheduler


_cached_scheduler: Optional[TaskScheduler] = None


def to_schedule(
    time_str: str, regularity: str, weekdays: list[int]
) -> tuple[str, str]:
    """Translate the UI schedule into a ``(schedule_type, schedule_value)`` pair.

    Recurring schedules become cron expressions; ``once`` becomes an ISO
    datetime for the next occurrence of *time_str*. ``weekdays`` uses
    0=Monday..6=Sunday (what the UI sends); cron wants 0=Sunday..6=Saturday.
    """
    try:
        hour_s, minute_s = time_str.split(":")
        hour, minute = int(hour_s), int(minute_s)
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"time must be HH:MM, got {time_str!r}") from exc
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"time out of range: {time_str!r}")

    if regularity == "once":
        now = datetime.now()
        run_at = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if run_at <= now:
            run_at += timedelta(days=1)
        return "once", run_at.isoformat()
    if regularity == "daily":
        return "cron", f"{minute} {hour} * * *"
    if regularity == "weekdays":
        return "cron", f"{minute} {hour} * * 1-5"
    if regularity == "monthly":
        return "cron", f"{minute} {hour} 1 * *"
    if regularity == "weekly":
        if not weekdays:
            raise ValueError("weekly schedules need at least one weekday")
        cron_days = sorted({(d + 1) % 7 for d in weekdays})
        return "cron", f"{minute} {hour} * * {','.join(str(d) for d in cron_days)}"
    raise ValueError(f"regularity must be one of {_REGULARITIES}, got {regularity!r}")


def task_to_workflow(task: ScheduledTask) -> dict[str, Any]:
    """Rebuild the UI workflow shape from a scheduler task."""
    meta = task.metadata or {}
    return {
        "id": task.id,
        "name": meta.get("name", ""),
        "time": meta.get("time", "09:00"),
        "regularity": meta.get("regularity", "weekdays"),
        "weekdays": meta.get("weekdays", []),
        "tools": [t for t in (task.tools or "").split(",") if t],
        "instructions": task.prompt,
        "autonomy": meta.get("autonomy", 2),
        "enabled": task.status == "active",
        "lastRun": meta.get("lastRun"),
        "nextRun": task.next_run,
    }


def _workflow_tasks(scheduler: TaskScheduler) -> list[ScheduledTask]:
    return [
        t
        for t in scheduler.list_tasks()
        if (t.metadata or {}).get("source") == WORKFLOW_SOURCE
        and t.status != "cancelled"
    ]


@workflow_router.get("/v1/workflows")
async def list_workflows():
    scheduler = _scheduler()
    tasks = await asyncio.to_thread(_workflow_tasks, scheduler)
    return {"workflows": [task_to_workflow(t) for t in tasks]}


@workflow_router.post("/v1/workflows")
async def save_workflow(body: WorkflowBody):
    """Create a workflow, or replace the one with the same id."""
    if not body.name.strip() or not body.instructions.strip():
        raise HTTPException(
            status_code=400, detail="name and instructions are required"
        )
    try:
        schedule_type, schedule_value = to_schedule(
            body.time, body.regularity, body.weekdays
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    scheduler = _scheduler()
    metadata = {
        "source": WORKFLOW_SOURCE,
        "name": body.name.strip(),
        "time": body.time,
        "regularity": body.regularity,
        "weekdays": body.weekdays,
        "autonomy": body.autonomy,
    }

    if body.id:
        # Replace: cancelling keeps the row's history out of the active list.
        try:
            await asyncio.to_thread(scheduler.cancel_task, body.id)
        except (KeyError, ValueError):
            pass

    task = await asyncio.to_thread(
        lambda: scheduler.create_task(
            body.instructions.strip(),
            schedule_type,
            schedule_value,
            tools=",".join(body.tools),
            metadata=metadata,
        )
    )
    if not body.enabled:
        await asyncio.to_thread(scheduler.pause_task, task.id)
        task.status = "paused"
    return task_to_workflow(task)


@workflow_router.post("/v1/workflows/{workflow_id}/enabled")
async def set_workflow_enabled(workflow_id: str, enabled: bool = True):
    scheduler = _scheduler()
    try:
        if enabled:
            await asyncio.to_thread(scheduler.resume_task, workflow_id)
        else:
            await asyncio.to_thread(scheduler.pause_task, workflow_id)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "enabled": enabled}


@workflow_router.delete("/v1/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    scheduler = _scheduler()
    try:
        await asyncio.to_thread(scheduler.cancel_task, workflow_id)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True}
