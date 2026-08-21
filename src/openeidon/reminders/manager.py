from __future__ import annotations

import json
import threading
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def _workspace_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _store_path() -> Path:
    return _workspace_root() / ".eidon-reminders.json"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class Reminder:
    id: str
    text: str
    due_at: str
    status: str = "active"
    created_at: str = ""
    triggered_at: str | None = None
    alert_pending: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Reminder":
        return cls(**data)


class ReminderManager:
    def __init__(self, store_path: Path | None = None, poll_interval: float = 1.0) -> None:
        self._store_path = store_path or _store_path()
        self._poll_interval = poll_interval
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._reminders = self._load()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="eidon-reminders")
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=self._poll_interval + 2)
            self._thread = None

    def create_reminder(self, text: str, *, delay_seconds: int | None = None, due_at: str | None = None) -> Reminder:
        if not text.strip():
            raise ValueError("Reminder text is required.")
        if delay_seconds is None and not due_at:
            raise ValueError("Either delay_seconds or due_at is required.")
        if delay_seconds is not None:
            target = _utc_now() + timedelta(seconds=max(1, int(delay_seconds)))
        else:
            target = datetime.fromisoformat(str(due_at).replace("Z", "+00:00")).astimezone(timezone.utc)

        reminder = Reminder(
            id=uuid.uuid4().hex[:12],
            text=text.strip(),
            due_at=target.isoformat(),
            created_at=_utc_now().isoformat(),
        )
        with self._lock:
            self._reminders.append(reminder)
            self._save()
        return reminder

    def list_reminders(self, status: str | None = None) -> list[Reminder]:
        with self._lock:
            items = list(self._reminders)
        if status:
            items = [r for r in items if r.status == status]
        return sorted(items, key=lambda r: r.due_at)

    def cancel_reminder(self, reminder_id: str) -> Reminder:
        with self._lock:
            for reminder in self._reminders:
                if reminder.id == reminder_id:
                    reminder.status = "cancelled"
                    reminder.alert_pending = False
                    self._save()
                    return reminder
        raise KeyError(reminder_id)

    def get_pending_alerts(self) -> list[Reminder]:
        with self._lock:
            return [r for r in self._reminders if r.alert_pending and r.status == "triggered"]

    def acknowledge_alert(self, reminder_id: str) -> Reminder:
        with self._lock:
            for reminder in self._reminders:
                if reminder.id == reminder_id:
                    reminder.alert_pending = False
                    self._save()
                    return reminder
        raise KeyError(reminder_id)

    def _loop(self) -> None:
        while not self._stop_event.is_set():
            self._mark_due_reminders()
            self._stop_event.wait(self._poll_interval)

    def _mark_due_reminders(self) -> None:
        now = _utc_now()
        changed = False
        with self._lock:
            for reminder in self._reminders:
                if reminder.status != "active":
                    continue
                due = datetime.fromisoformat(reminder.due_at.replace("Z", "+00:00")).astimezone(timezone.utc)
                if due <= now:
                    reminder.status = "triggered"
                    reminder.triggered_at = now.isoformat()
                    reminder.alert_pending = True
                    changed = True
            if changed:
                self._save()

    def _load(self) -> list[Reminder]:
        path = self._store_path
        if not path.exists():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            return [Reminder.from_dict(item) for item in raw]
        except Exception:
            return []

    def _save(self) -> None:
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        self._store_path.write_text(
            json.dumps([r.to_dict() for r in self._reminders], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


_DEFAULT_MANAGER: ReminderManager | None = None


def set_default_reminder_manager(manager: ReminderManager | None) -> None:
    global _DEFAULT_MANAGER
    _DEFAULT_MANAGER = manager


def get_default_reminder_manager() -> ReminderManager | None:
    return _DEFAULT_MANAGER
