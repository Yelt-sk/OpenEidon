"""ABC for channel implementations and shared types."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional


class ChannelStatus(str, Enum):
    """Channel connection status."""

    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    ERROR = "error"


@dataclass(slots=True)
class ChannelMessage:
    """A message received from or sent to a channel."""

    channel: str
    sender: str
    content: str
    message_id: str = ""
    conversation_id: str = ""
    session_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


# Type for message handler callbacks
ChannelHandler = Callable[[ChannelMessage], Optional[str]]


class BaseChannel(ABC):
    """Base class for all channel implementations.

    Subclasses must be registered via
    ``@ChannelRegistry.register("name")`` to become discoverable.
    """

    channel_id: str

    @abstractmethod
    def connect(self) -> None:
        """Establish connection to the channel gateway."""

    @abstractmethod
    def disconnect(self) -> None:
        """Close connection to the channel gateway."""

    @abstractmethod
    def send(
        self,
        channel: str,
        content: str,
        *,
        conversation_id: str = "",
        metadata: Dict[str, Any] | None = None,
    ) -> bool:
        """Send a message to a specific channel. Returns True on success."""

    @abstractmethod
    def status(self) -> ChannelStatus:
        """Return the current connection status."""

    @abstractmethod
    def list_channels(self) -> List[str]:
        """Return list of available channel names."""

    @abstractmethod
    def on_message(self, handler: ChannelHandler) -> None:
        """Register a callback for incoming messages."""


__all__ = ["BaseChannel", "ChannelHandler", "ChannelMessage", "ChannelStatus"]
