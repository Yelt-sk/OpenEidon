"""Tests for the WebChatChannel adapter."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from openjarvis.channels._stubs import ChannelStatus
from openjarvis.channels.webchat import WebChatChannel
from openjarvis.core.events import EventBus, EventType
from openjarvis.core.registry import ChannelRegistry


@pytest.fixture(autouse=True)
def _register_webchat():
    """Re-register after any registry clear."""
    if not ChannelRegistry.contains("webchat"):
        ChannelRegistry.register_value("webchat", WebChatChannel)


class TestRegistration:
    def test_registry_key(self):
        assert ChannelRegistry.contains("webchat")

    def test_channel_id(self):
        ch = WebChatChannel()
        assert ch.channel_id == "webchat"


class TestInit:
    def test_defaults(self):
        ch = WebChatChannel()
        assert ch._messages == []
        assert ch._handlers == []
        assert ch._status == ChannelStatus.DISCONNECTED


class TestSend:
    def test_send_success(self):
        ch = WebChatChannel()
        result = ch.send("user", "Hello!")
        assert result is True

    def test_send_publishes_event(self):
        bus = EventBus(record_history=True)
        ch = WebChatChannel(bus=bus)
        ch.send("user", "Hello!")

        event_types = [e.event_type for e in bus.history]
        assert EventType.CHANNEL_MESSAGE_SENT in event_types

    def test_get_messages(self):
        ch = WebChatChannel()
        ch.send("user1", "Hello!")
        ch.send("user2", "World!")
        ch.send("user1", "Again!")
        messages = ch.get_messages()
        assert len(messages) == 3
        assert messages[0].content == "Hello!"
        assert messages[1].content == "World!"
        assert messages[2].content == "Again!"

    def test_clear_messages(self):
        ch = WebChatChannel()
        ch.send("user1", "Hello!")
        ch.send("user2", "World!")
        assert len(ch.get_messages()) == 2
        ch.clear_messages()
        assert len(ch.get_messages()) == 0


class TestListChannels:
    def test_list_channels(self):
        ch = WebChatChannel()
        assert ch.list_channels() == ["webchat"]


class TestStatus:
    def test_disconnected_initially(self):
        ch = WebChatChannel()
        assert ch.status() == ChannelStatus.DISCONNECTED

    def test_connected_after_connect(self):
        ch = WebChatChannel()
        ch.connect()
        assert ch.status() == ChannelStatus.CONNECTED


class TestOnMessage:
    def test_on_message(self):
        ch = WebChatChannel()
        handler = MagicMock()
        ch.on_message(handler)
        assert handler in ch._handlers


class TestDisconnect:
    def test_disconnect(self):
        ch = WebChatChannel()
        ch._status = ChannelStatus.CONNECTED
        ch.disconnect()
        assert ch.status() == ChannelStatus.DISCONNECTED
