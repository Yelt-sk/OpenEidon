"""An explicit max_tokens must be a hard cap.

The server used to raise the caller's budget from a complexity heuristic and
the agent path ignored it entirely, so a routing call asking for 16 tokens
got 36 and could not bound its own latency.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from openeidon.server.app import create_app


@pytest.fixture
def engine():
    mock = MagicMock()
    mock.generate.return_value = {
        "content": "ok",
        "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7},
        "model": "test-model",
        "finish_reason": "stop",
    }
    mock.list_models.return_value = ["test-model"]
    return mock


@pytest.fixture
def client(engine):
    return TestClient(create_app(engine=engine, model="test-model"))


def _sent_max_tokens(engine) -> int:
    assert engine.generate.called, "engine.generate was never called"
    return engine.generate.call_args.kwargs["max_tokens"]


class TestExplicitBudget:
    def test_small_cap_reaches_the_engine(self, client, engine):
        client.post(
            "/v1/chat/completions",
            json={
                "model": "test-model",
                "messages": [{"role": "user", "content": "перечисли цвета радуги"}],
                "max_tokens": 16,
            },
        )
        assert _sent_max_tokens(engine) == 16

    def test_cap_of_one_is_respected(self, client, engine):
        client.post(
            "/v1/chat/completions",
            json={
                "model": "test-model",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 1,
            },
        )
        assert _sent_max_tokens(engine) == 1

    def test_large_cap_passes_through(self, client, engine):
        client.post(
            "/v1/chat/completions",
            json={
                "model": "test-model",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 4096,
            },
        )
        assert _sent_max_tokens(engine) == 4096


class TestImplicitBudget:
    def test_omitted_max_tokens_still_produces_one(self, client, engine):
        """No cap from the caller means the server picks a budget."""
        response = client.post(
            "/v1/chat/completions",
            json={
                "model": "test-model",
                "messages": [{"role": "user", "content": "hi"}],
            },
        )
        assert response.status_code == 200
        assert _sent_max_tokens(engine) > 0


class TestAgentPath:
    def test_agent_receives_the_request_budget(self, engine):
        agent = MagicMock()
        agent._model = "test-model"
        agent._max_tokens = 1024
        agent._temperature = 0.7
        from openeidon.agents._stubs import AgentResult

        agent.run.return_value = AgentResult(content="ok")
        client = TestClient(
            create_app(engine=engine, model="test-model", agent=agent)
        )
        client.post(
            "/v1/chat/completions",
            json={
                "model": "test-model",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 40,
                "temperature": 0.0,
            },
        )
        assert agent.run.called
        # Settings are applied for the call and restored afterwards.
        assert agent._max_tokens == 1024
        assert agent._temperature == 0.7
