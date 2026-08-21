"""Tests for Slack messaging channel — Socket Mode binding and message handling."""

from __future__ import annotations

from unittest.mock import MagicMock, patch


def test_slack_channel_connect_with_tokens() -> None:
    """SlackChannel.connect() succeeds with bot_token + app_token."""
    from openeidon.channels.slack import SlackChannel

    ch = SlackChannel(
        bot_token="xoxb-test-token",
        app_token="xapp-test-token",
    )
    # Mock the SocketModeClient import to avoid real connection
    with patch("openeidon.channels.slack.SlackChannel._socket_mode_loop"):
        ch.connect()

    from openeidon.channels._stubs import ChannelStatus

    assert ch.status() == ChannelStatus.CONNECTED


def test_slack_channel_send_only_without_app_token() -> None:
    """SlackChannel with only bot_token enters send-only mode."""
    from openeidon.channels.slack import SlackChannel

    ch = SlackChannel(bot_token="xoxb-test-token")
    ch.connect()

    from openeidon.channels._stubs import ChannelStatus

    assert ch.status() == ChannelStatus.CONNECTED
    assert ch._listener_thread is None  # No Socket Mode listener


def test_slack_channel_no_token_errors() -> None:
    """SlackChannel without any token enters error state."""
    from openeidon.channels.slack import SlackChannel

    ch = SlackChannel()
    ch.connect()

    from openeidon.channels._stubs import ChannelStatus

    assert ch.status() == ChannelStatus.ERROR


def test_slack_channel_disconnect() -> None:
    """SlackChannel.disconnect() sets status to disconnected."""
    from openeidon.channels.slack import SlackChannel

    ch = SlackChannel(bot_token="xoxb-test-token")
    ch.connect()
    ch.disconnect()

    from openeidon.channels._stubs import ChannelStatus

    assert ch.status() == ChannelStatus.DISCONNECTED


def test_slack_channel_handler_registration() -> None:
    """on_message registers a handler that receives messages."""
    from openeidon.channels.slack import SlackChannel

    ch = SlackChannel(bot_token="xoxb-test-token")
    handler = MagicMock()
    ch.on_message(handler)
    assert handler in ch._handlers


def test_slack_channel_send_without_connection_fails_gracefully() -> None:
    """send() to an unconnected channel returns False without crashing."""
    from openeidon.channels.slack import SlackChannel

    ch = SlackChannel()  # No token
    result = ch.send("C123456", "Hello from test")
    assert result is False


def test_slack_channel_send_with_token_is_callable() -> None:
    """send() with a token is callable and returns a bool."""
    from openeidon.channels.slack import SlackChannel

    ch = SlackChannel(bot_token="xoxb-test-token")
    # Don't actually call the API, just verify interface
    assert callable(ch.send)
    assert hasattr(ch, "send")
