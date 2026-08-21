"""Tests for the /v1/workflows routes and their schedule translation."""

from __future__ import annotations

from datetime import datetime

import pytest

from openeidon.scheduler.scheduler import ScheduledTask
from openeidon.server.workflow_routes import (
    WORKFLOW_SOURCE,
    task_to_workflow,
    to_schedule,
)


class TestToSchedule:
    def test_daily(self):
        assert to_schedule("09:30", "daily", []) == ("cron", "30 9 * * *")

    def test_weekdays(self):
        assert to_schedule("07:00", "weekdays", []) == ("cron", "0 7 * * 1-5")

    def test_monthly_runs_on_the_first(self):
        assert to_schedule("12:00", "monthly", []) == ("cron", "0 12 1 * *")

    def test_weekly_maps_monday_zero_to_cron_monday_one(self):
        # UI: 0=Monday, 6=Sunday. cron: 0=Sunday, 1=Monday.
        assert to_schedule("18:15", "weekly", [0]) == ("cron", "15 18 * * 1")
        assert to_schedule("18:15", "weekly", [6]) == ("cron", "15 18 * * 0")
        assert to_schedule("18:15", "weekly", [0, 6]) == ("cron", "15 18 * * 0,1")

    def test_weekly_requires_a_weekday(self):
        with pytest.raises(ValueError, match="at least one weekday"):
            to_schedule("09:00", "weekly", [])

    def test_once_returns_future_iso_datetime(self):
        kind, value = to_schedule("23:59", "once", [])
        assert kind == "once"
        assert datetime.fromisoformat(value) > datetime.now()

    def test_once_rolls_to_tomorrow_when_time_has_passed(self):
        kind, value = to_schedule("00:00", "once", [])
        assert kind == "once"
        assert datetime.fromisoformat(value) > datetime.now()

    @pytest.mark.parametrize("bad", ["25:00", "12:99", "noon", "", "12"])
    def test_rejects_bad_time(self, bad):
        with pytest.raises(ValueError):
            to_schedule(bad, "daily", [])

    def test_rejects_unknown_regularity(self):
        with pytest.raises(ValueError, match="regularity must be one of"):
            to_schedule("09:00", "hourly", [])


class TestTaskToWorkflow:
    def _task(self, **overrides):
        defaults = dict(
            id="task1",
            prompt="do the thing",
            schedule_type="cron",
            schedule_value="0 9 * * 1-5",
            status="active",
            tools="web_search,shell_exec",
            metadata={
                "source": WORKFLOW_SOURCE,
                "name": "Morning digest",
                "time": "09:00",
                "regularity": "weekdays",
                "weekdays": [],
                "autonomy": 3,
            },
        )
        defaults.update(overrides)
        return ScheduledTask(**defaults)

    def test_round_trips_ui_fields(self):
        wf = task_to_workflow(self._task())
        assert wf["name"] == "Morning digest"
        assert wf["instructions"] == "do the thing"
        assert wf["tools"] == ["web_search", "shell_exec"]
        assert wf["autonomy"] == 3
        assert wf["enabled"] is True

    def test_paused_task_is_disabled(self):
        assert task_to_workflow(self._task(status="paused"))["enabled"] is False

    def test_empty_tools_is_empty_list(self):
        assert task_to_workflow(self._task(tools=""))["tools"] == []

    def test_missing_metadata_falls_back_to_defaults(self):
        wf = task_to_workflow(self._task(metadata={}))
        assert wf["name"] == ""
        assert wf["time"] == "09:00"
        assert wf["autonomy"] == 2


class TestWorkflowRoutes:
    @pytest.fixture
    def client(self, tmp_path, monkeypatch):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from openeidon.scheduler.scheduler import TaskScheduler
        from openeidon.scheduler.store import SchedulerStore
        from openeidon.server import workflow_routes

        scheduler = TaskScheduler(SchedulerStore(tmp_path / "sched.db"))
        monkeypatch.setattr(workflow_routes, "_scheduler", lambda: scheduler)
        app = FastAPI()
        app.include_router(workflow_routes.workflow_router)
        return TestClient(app)

    def test_empty_initially(self, client):
        assert client.get("/v1/workflows").json() == {"workflows": []}

    def test_create_then_list(self, client):
        created = client.post(
            "/v1/workflows",
            json={
                "name": "Digest",
                "instructions": "summarize my inbox",
                "time": "08:30",
                "regularity": "weekdays",
            },
        )
        assert created.status_code == 200
        body = created.json()
        assert body["name"] == "Digest"

        listed = client.get("/v1/workflows").json()["workflows"]
        assert len(listed) == 1
        assert listed[0]["id"] == body["id"]

    def test_rejects_missing_instructions(self, client):
        resp = client.post("/v1/workflows", json={"name": "x", "instructions": "  "})
        assert resp.status_code == 400

    def test_rejects_bad_time(self, client):
        resp = client.post(
            "/v1/workflows",
            json={"name": "x", "instructions": "y", "time": "99:99"},
        )
        assert resp.status_code == 400

    def test_disabled_workflow_is_created_paused(self, client):
        body = client.post(
            "/v1/workflows",
            json={"name": "x", "instructions": "y", "enabled": False},
        ).json()
        assert body["enabled"] is False

    def test_delete_removes_from_list(self, client):
        body = client.post(
            "/v1/workflows", json={"name": "x", "instructions": "y"}
        ).json()
        assert client.delete(f"/v1/workflows/{body['id']}").status_code == 200
        assert client.get("/v1/workflows").json()["workflows"] == []

    def test_delete_unknown_is_404(self, client):
        assert client.delete("/v1/workflows/nope").status_code == 404

    def test_saving_with_id_replaces_rather_than_duplicates(self, client):
        first = client.post(
            "/v1/workflows", json={"name": "x", "instructions": "y"}
        ).json()
        client.post(
            "/v1/workflows",
            json={"id": first["id"], "name": "x2", "instructions": "y2"},
        )
        listed = client.get("/v1/workflows").json()["workflows"]
        assert len(listed) == 1
        assert listed[0]["name"] == "x2"
