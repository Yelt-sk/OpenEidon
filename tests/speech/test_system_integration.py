"""Tests for speech integration in SystemBuilder/JarvisSystem."""

from openjarvis.system import JarvisSystem


def test_jarvis_system_has_speech_backend():
    """JarvisSystem has a speech_backend attribute."""
    assert "speech_backend" in JarvisSystem.__dataclass_fields__
