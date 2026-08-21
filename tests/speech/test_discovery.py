"""Tests for speech backend auto-discovery."""

from unittest.mock import patch

from openeidon.core.config import EidonConfig


def test_get_speech_backend_explicit():
    """Explicit backend selection works."""
    from openeidon.speech._discovery import get_speech_backend

    config = EidonConfig()
    config.speech.backend = "faster-whisper"

    with patch("openeidon.speech._discovery._create_backend") as mock_create:
        mock_backend = type(
            "MockBackend",
            (),
            {
                "backend_id": "faster-whisper",
                "health": lambda self: True,
            },
        )()
        mock_create.return_value = mock_backend

        result = get_speech_backend(config)
        assert result is not None
        assert result.backend_id == "faster-whisper"


def test_get_speech_backend_returns_none_if_nothing_available():
    """Returns None when no backend can be created."""
    from openeidon.speech._discovery import get_speech_backend

    config = EidonConfig()
    config.speech.backend = "nonexistent"

    result = get_speech_backend(config)
    assert result is None


def test_auto_discovery_priority():
    """Auto mode tries backends in priority order."""
    from openeidon.speech._discovery import DISCOVERY_ORDER

    assert DISCOVERY_ORDER[0] == "faster-whisper"
    assert "openai" in DISCOVERY_ORDER
    assert "deepgram" in DISCOVERY_ORDER
