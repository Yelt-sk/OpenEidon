"""Tests for agent error classification."""

from __future__ import annotations


class TestErrorClassification:
    def test_retryable_error(self):
        from openjarvis.agents.errors import RetryableError

        err = RetryableError("rate limit hit")
        assert err.retryable is True
        assert str(err) == "rate limit hit"

    def test_fatal_error(self):
        from openjarvis.agents.errors import FatalError

        err = FatalError("invalid API key")
        assert err.retryable is False

    def test_escalate_error(self):
        from openjarvis.agents.errors import EscalateError

        err = EscalateError("agent uncertain about next step")
        assert err.retryable is False
        assert err.needs_human is True

    def test_classify_rate_limit(self):
        from openjarvis.agents.errors import classify_error

        result = classify_error(Exception("rate limit exceeded"))
        assert result.retryable is True

    def test_classify_timeout(self):
        from openjarvis.agents.errors import classify_error

        result = classify_error(TimeoutError("connection timed out"))
        assert result.retryable is True

    def test_classify_permission(self):
        from openjarvis.agents.errors import classify_error

        result = classify_error(PermissionError("access denied"))
        assert result.retryable is False

    def test_classify_unknown_defaults_retryable(self):
        from openjarvis.agents.errors import classify_error

        result = classify_error(ValueError("something weird"))
        assert result.retryable is True

    def test_retry_delay_exponential(self):
        from openjarvis.agents.errors import retry_delay

        assert retry_delay(0) == 10
        assert retry_delay(1) == 20
        assert retry_delay(2) == 40
        # Capped at 300 seconds
        assert retry_delay(10) == 300
