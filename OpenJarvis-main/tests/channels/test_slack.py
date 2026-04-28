"""Tests for the SlackChannel adapter."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from openjarvis.channels._stubs import ChannelStatus
from openjarvis.channels.slack import SlackChannel
from openjarvis.core.events import EventBus, EventType
from openjarvis.core.registry import ChannelRegistry


@pytest.fixture(autouse=True)
def _register_slack():
    """Re-register after any registry clear."""
    if not ChannelRegistry.contains("slack"):
        ChannelRegistry.register_value("slack", SlackChannel)


class TestRegistration:
    def test_registry_key(self):
        assert ChannelRegistry.contains("slack")

    def test_channel_id(self):
        ch = SlackChannel(bot_token="xoxb-test")
        assert ch.channel_id == "slack"


class TestInit:
    def test_defaults(self):
        ch = SlackChannel()
        assert ch._token == ""
        assert ch._app_token == ""
        assert ch._status == ChannelStatus.DISCONNECTED

    def test_constructor_token(self):
        ch = SlackChannel(bot_token="xoxb-my-token")
        assert ch._token == "xoxb-my-token"

    def test_env_var_fallback(self):
        with patch.dict(os.environ, {"SLACK_BOT_TOKEN": "xoxb-env"}):
            ch = SlackChannel()
            assert ch._token == "xoxb-env"

    def test_app_token_env_var(self):
        with patch.dict(os.environ, {"SLACK_APP_TOKEN": "xapp-env"}):
            ch = SlackChannel()
            assert ch._app_token == "xapp-env"

    def test_constructor_overrides_env(self):
        with patch.dict(os.environ, {"SLACK_BOT_TOKEN": "xoxb-env"}):
            ch = SlackChannel(bot_token="xoxb-explicit")
            assert ch._token == "xoxb-explicit"


class TestSend:
    def test_send_success(self):
        ch = SlackChannel(bot_token="xoxb-test")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ok": True}

        with patch("httpx.post", return_value=mock_response) as mock_post:
            result = ch.send("C1234567890", "Hello Slack!")
            assert result is True
            mock_post.assert_called_once()
            call_args = mock_post.call_args
            url = call_args[0][0]
            assert "slack.com/api/chat.postMessage" in url
            headers = call_args[1]["headers"]
            assert headers["Authorization"] == "Bearer xoxb-test"
            payload = call_args[1]["json"]
            assert payload["channel"] == "C1234567890"
            assert payload["text"] == "Hello Slack!"

    def test_send_with_thread(self):
        ch = SlackChannel(bot_token="xoxb-test")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ok": True}

        with patch("httpx.post", return_value=mock_response) as mock_post:
            ch.send("C123", "Reply", conversation_id="1234567890.123456")
            payload = mock_post.call_args[1]["json"]
            assert payload["thread_ts"] == "1234567890.123456"

    def test_send_api_error(self):
        ch = SlackChannel(bot_token="xoxb-test")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ok": False, "error": "channel_not_found"}

        with patch("httpx.post", return_value=mock_response):
            result = ch.send("C123", "Hello!")
            assert result is False

    def test_send_http_failure(self):
        ch = SlackChannel(bot_token="xoxb-test")

        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch("httpx.post", return_value=mock_response):
            result = ch.send("C123", "Hello!")
            assert result is False

    def test_send_exception(self):
        ch = SlackChannel(bot_token="xoxb-test")

        with patch("httpx.post", side_effect=ConnectionError("refused")):
            result = ch.send("C123", "Hello!")
            assert result is False

    def test_send_no_token(self):
        ch = SlackChannel()
        result = ch.send("C123", "Hello!")
        assert result is False

    def test_send_publishes_event(self):
        bus = EventBus(record_history=True)
        ch = SlackChannel(bot_token="xoxb-test", bus=bus)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ok": True}

        with patch("httpx.post", return_value=mock_response):
            ch.send("C123", "Hello!")

        event_types = [e.event_type for e in bus.history]
        assert EventType.CHANNEL_MESSAGE_SENT in event_types


class TestListChannels:
    def test_list_channels(self):
        ch = SlackChannel(bot_token="xoxb-test")
        assert ch.list_channels() == ["slack"]


class TestStatus:
    def test_disconnected_initially(self):
        ch = SlackChannel(bot_token="xoxb-test")
        assert ch.status() == ChannelStatus.DISCONNECTED

    def test_no_token_connect_error(self):
        ch = SlackChannel()
        ch.connect()
        assert ch.status() == ChannelStatus.ERROR


class TestOnMessage:
    def test_on_message(self):
        ch = SlackChannel(bot_token="xoxb-test")
        handler = MagicMock()
        ch.on_message(handler)
        assert handler in ch._handlers


class TestDisconnect:
    def test_disconnect(self):
        ch = SlackChannel(bot_token="xoxb-test")
        ch._status = ChannelStatus.CONNECTED
        ch.disconnect()
        assert ch.status() == ChannelStatus.DISCONNECTED
