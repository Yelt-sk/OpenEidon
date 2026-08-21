"""Tests for the OpenCode bridge (offline — HTTP and process are mocked)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from openeidon.connectors.opencode import (
    OpenCodeError,
    OpenCodeManager,
    extract_text_reply,
)


class TestExtractTextReply:
    def test_returns_last_assistant_text(self):
        messages = [
            {"info": {"role": "user"}, "parts": [{"type": "text", "text": "task"}]},
            {
                "info": {"role": "assistant"},
                "parts": [{"type": "text", "text": "first"}],
            },
            {
                "info": {"role": "assistant"},
                "parts": [
                    {"type": "tool", "tool": "bash"},
                    {"type": "text", "text": "done"},
                ],
            },
        ]
        assert extract_text_reply(messages) == "done"

    def test_empty_when_no_assistant_text(self):
        assert extract_text_reply([]) == ""
        assert (
            extract_text_reply(
                [{"info": {"role": "user"}, "parts": [{"type": "text", "text": "hi"}]}]
            )
            == ""
        )

    def test_joins_multiple_text_parts(self):
        messages = [
            {
                "info": {"role": "assistant"},
                "parts": [
                    {"type": "text", "text": "a"},
                    {"type": "text", "text": "b"},
                ],
            }
        ]
        assert extract_text_reply(messages) == "a\nb"


class TestManagerAvailability:
    def test_unavailable_without_binary(self):
        manager = OpenCodeManager(binary="definitely-not-a-real-binary")
        with patch("shutil.which", return_value=None):
            assert not manager.available()
            with pytest.raises(OpenCodeError, match="not found"):
                manager.start()

    def test_not_running_initially(self):
        assert not OpenCodeManager().is_running()


class TestManagerRequests:
    def _manager_with_client(self, response: MagicMock) -> OpenCodeManager:
        manager = OpenCodeManager(port=9)
        client = MagicMock()
        client.request.return_value = response
        manager._client = client
        return manager

    def test_error_status_raises(self):
        response = MagicMock(status_code=500, text="boom")
        manager = self._manager_with_client(response)
        with pytest.raises(OpenCodeError, match="500"):
            manager.list_sessions()

    def test_create_session_passes_directory(self):
        response = MagicMock(status_code=200)
        response.headers = {"content-type": "application/json"}
        response.json.return_value = {"id": "ses_1"}
        manager = self._manager_with_client(response)
        result = manager.create_session("/tmp/proj", title="t")
        assert result == {"id": "ses_1"}
        _, kwargs = manager._client.request.call_args
        assert kwargs["params"] == {"directory": "/tmp/proj"}
        assert kwargs["json"] == {"title": "t"}

    def test_prompt_builds_model_body(self):
        response = MagicMock(status_code=200)
        response.headers = {"content-type": "application/json"}
        response.json.return_value = {}
        manager = self._manager_with_client(response)
        manager.prompt("ses_1", "fix it", model="ollama/qwen3:8b", wait=False)
        args, kwargs = manager._client.request.call_args
        assert args == ("POST", "/session/ses_1/prompt_async")
        assert kwargs["json"]["model"] == {
            "providerID": "ollama",
            "modelID": "qwen3:8b",
        }

    def test_respond_permission_payload(self):
        response = MagicMock(status_code=200)
        response.headers = {"content-type": "application/json"}
        response.json.return_value = {}
        manager = self._manager_with_client(response)
        manager.respond_permission("ses_1", "perm_1", "once")
        args, kwargs = manager._client.request.call_args
        assert args == ("POST", "/session/ses_1/permissions/perm_1")
        assert kwargs["json"] == {"response": "once"}


class TestCodeAgentTool:
    def _tool(self):
        from openeidon.tools.code_agent import CodeAgentTool

        return CodeAgentTool()

    def test_registered_via_tools_package_import(self):
        import importlib
        import sys

        import openeidon.tools as tools_pkg
        from openeidon.core.registry import ToolRegistry

        sys.modules.pop("openeidon.tools.code_agent", None)
        importlib.reload(tools_pkg)
        assert ToolRegistry.contains("code_agent")

    def test_requires_params(self):
        result = self._tool().execute()
        assert not result.success

    def test_rejects_missing_directory(self):
        result = self._tool().execute(task="x", directory="Z:/no/such/dir-xyz")
        assert not result.success
        assert "does not exist" in result.content

    def test_success_path_with_mocked_manager(self, tmp_path):
        manager = MagicMock()
        manager.create_session.return_value = {"id": "ses_1"}
        manager.messages.return_value = [
            {"info": {"role": "assistant"}, "parts": [{"type": "text", "text": "ok"}]}
        ]
        manager.diff.return_value = [{"file": "a.py"}]
        with patch(
            "openeidon.connectors.opencode.get_manager", return_value=manager
        ):
            result = self._tool().execute(task="fix", directory=str(tmp_path))
        assert result.success
        assert "ok" in result.content
        assert result.metadata["changed_files"] == ["a.py"]
        manager.prompt.assert_called_once()
