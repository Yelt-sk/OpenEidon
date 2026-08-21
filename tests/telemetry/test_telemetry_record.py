"""Tests for TelemetryRecord fields."""

from __future__ import annotations

from openjarvis.core.types import TelemetryRecord


class TestTelemetryRecord:
    def test_tokens_per_joule_field_exists(self):
        rec = TelemetryRecord(timestamp=1.0, model_id="test")
        assert hasattr(rec, "tokens_per_joule")
        assert rec.tokens_per_joule == 0.0

    def test_tokens_per_joule_set(self):
        rec = TelemetryRecord(
            timestamp=1.0,
            model_id="test",
            tokens_per_joule=80.0,
        )
        assert rec.tokens_per_joule == 80.0
