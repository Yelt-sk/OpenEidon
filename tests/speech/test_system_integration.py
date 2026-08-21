"""Tests for speech integration in SystemBuilder/EidonSystem."""

from openeidon.system import EidonSystem


def test_eidon_system_has_speech_backend():
    """EidonSystem has a speech_backend attribute."""
    assert "speech_backend" in EidonSystem.__dataclass_fields__
