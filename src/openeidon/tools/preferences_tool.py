"""Manage persistent user preferences (user_preferences.json)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from openeidon.core.registry import ToolRegistry
from openeidon.core.types import ToolResult
from openeidon.tools._stubs import BaseTool, ToolSpec

PREFS_PATH = Path.home() / ".openeidon" / "user_preferences.json"

_DEFAULTS: dict = {
    "work_apps": [],
    "music": {"genres": [], "artists": []},
    "frequent_apps": {},
    "custom": {},
}


def _load(path: Path = PREFS_PATH) -> dict:
    """Load preferences from JSON file, returning defaults if missing."""
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return dict(_DEFAULTS)


def _save(path: Path, data: dict) -> None:
    """Save preferences to JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


@ToolRegistry.register("preferences_manage")
class PreferencesTool(BaseTool):
    """Manage persistent user preferences: work apps, music genres, custom settings."""

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="preferences_manage",
            description=(
                "Read or update persistent user preferences such as preferred work applications, "
                "music genres, artists, or custom key-value settings. "
                "Use action='read' to retrieve all preferences. "
                "Use action='set_work_apps' with apps=['figma','vs code'] to save work apps. "
                "Use action='set_music' with genres=['rock'] and/or artists=['acdc'] for music. "
                "Use action='set_custom' with key='...' and value='...' for arbitrary preferences. "
                "Use action='increment_app' with app='figma' to track app usage frequency."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "read",
                            "set_work_apps",
                            "set_music",
                            "set_custom",
                            "increment_app",
                        ],
                        "description": "Action to perform.",
                    },
                    "apps": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of app names for set_work_apps.",
                    },
                    "genres": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of music genres for set_music.",
                    },
                    "artists": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of music artists for set_music.",
                    },
                    "key": {
                        "type": "string",
                        "description": "Custom preference key for set_custom.",
                    },
                    "value": {
                        "description": "Custom preference value for set_custom.",
                    },
                    "app": {
                        "type": "string",
                        "description": "App name to increment usage count.",
                    },
                },
                "required": ["action"],
            },
            category="memory",
        )

    def execute(self, **params: Any) -> ToolResult:
        action = params.get("action", "read")

        if action == "read":
            data = _load()
            return ToolResult(
                tool_name=self.spec.name,
                success=True,
                content=json.dumps(data, ensure_ascii=False, indent=2),
            )

        elif action == "set_work_apps":
            apps = params.get("apps", [])
            if not isinstance(apps, list):
                apps = [str(apps)]
            data = _load()
            data["work_apps"] = [str(a).strip() for a in apps if str(a).strip()]
            _save(PREFS_PATH, data)
            return ToolResult(
                tool_name=self.spec.name,
                success=True,
                content=f"Saved work apps: {', '.join(data['work_apps'])}",
            )

        elif action == "set_music":
            genres = params.get("genres")
            artists = params.get("artists")
            data = _load()
            if genres is not None:
                data["music"]["genres"] = [str(g).strip() for g in genres if str(g).strip()]
            if artists is not None:
                data["music"]["artists"] = [str(a).strip() for a in artists if str(a).strip()]
            _save(PREFS_PATH, data)
            return ToolResult(
                tool_name=self.spec.name,
                success=True,
                content=(
                    f"Saved music preferences: genres={data['music']['genres']}, "
                    f"artists={data['music']['artists']}"
                ),
            )

        elif action == "set_custom":
            key = params.get("key", "")
            value = params.get("value")
            if not key:
                return ToolResult(
                    tool_name=self.spec.name,
                    success=False,
                    content="key is required for set_custom",
                )
            data = _load()
            data["custom"][key] = value
            _save(PREFS_PATH, data)
            return ToolResult(
                tool_name=self.spec.name,
                success=True,
                content=f"Saved custom preference: {key} = {value}",
            )

        elif action == "increment_app":
            app = params.get("app", "").strip()
            if not app:
                return ToolResult(
                    tool_name=self.spec.name,
                    success=False,
                    content="app is required for increment_app",
                )
            data = _load()
            data["frequent_apps"][app] = data["frequent_apps"].get(app, 0) + 1
            _save(PREFS_PATH, data)
            return ToolResult(
                tool_name=self.spec.name,
                success=True,
                content=f"App usage: {app} = {data['frequent_apps'][app]}",
            )

        return ToolResult(
            tool_name=self.spec.name,
            success=False,
            content=f"Unknown action: {action}",
        )
