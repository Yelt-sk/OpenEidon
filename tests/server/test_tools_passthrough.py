"""A client that supplies tools must get tool_calls back.

With an agent configured, the non-streaming path handed the request to the
agent, which runs its own registry tools and ignores the ones in the
request. A caller asking the model to route a command therefore received a
plain refusal — measured at 8.2 s and no tool call, against 1.6 s and the
right call once the request is dispatched directly.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from openeidon.agents._stubs import AgentResult
from openeidon.server.app import create_app

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "open_app",
            "description": "Open a desktop application.",
            "parameters": {
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            },
        },
    }
]


@pytest.fixture
def engine():
    mock = MagicMock()
    mock.generate.return_value = {
        "content": "",
        # Engines report tool calls flat; the route reshapes them into the
        # OpenAI envelope on the way out.
        "tool_calls": [
            {"id": "call_1", "name": "open_app", "arguments": '{"name": "YouTube"}'}
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        "model": "test-model",
        "finish_reason": "tool_calls",
    }
    mock.list_models.return_value = ["test-model"]
    return mock


@pytest.fixture
def agent():
    mock = MagicMock()
    mock._model = "test-model"
    mock._max_tokens = 1024
    mock._temperature = 0.7
    mock.run.return_value = AgentResult(content="I cannot open websites.")
    return mock


def _post(client: TestClient, **extra):
    body = {
        "model": "test-model",
        "messages": [{"role": "user", "content": "открой ютуб"}],
        "max_tokens": 200,
    }
    body.update(extra)
    return client.post("/v1/chat/completions", json=body)


class TestToolsReachTheEngine:
    def test_request_tools_bypass_the_agent(self, engine, agent):
        client = TestClient(
            create_app(engine=engine, model="test-model", agent=agent)
        )
        response = _post(client, tools=TOOLS)
        assert response.status_code == 200
        agent.run.assert_not_called()
        assert engine.generate.call_args.kwargs["tools"] == TOOLS

    def test_tool_calls_are_returned_to_the_caller(self, engine, agent):
        client = TestClient(
            create_app(engine=engine, model="test-model", agent=agent)
        )
        message = _post(client, tools=TOOLS).json()["choices"][0]["message"]
        calls = message.get("tool_calls")
        assert calls, "tool_calls missing from the response"
        assert calls[0]["function"]["name"] == "open_app"

    def test_without_tools_the_agent_still_handles_the_request(self, engine, agent):
        client = TestClient(
            create_app(engine=engine, model="test-model", agent=agent)
        )
        response = _post(client)
        assert response.status_code == 200
        agent.run.assert_called_once()

    def test_no_agent_configured_still_forwards_tools(self, engine):
        client = TestClient(create_app(engine=engine, model="test-model"))
        _post(client, tools=TOOLS)
        assert engine.generate.call_args.kwargs["tools"] == TOOLS
