"""Model size/metadata reporting and the lightest-model default.

The size shown next to each model in the UI travels from the engine through
several wrappers; each of them has to forward ``list_models_detailed()`` or
the metadata silently degrades to ids only.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest

from openeidon.engine.ollama import OllamaEngine
from openeidon.intelligence.model_resolver import lightest_model


def _tags_payload() -> dict:
    return {
        "models": [
            {
                "name": "qwen3:1.7b",
                "size": 1_359_000_000,
                "details": {"parameter_size": "2.0B", "quantization_level": "Q4_K_M"},
            },
            {
                "name": "qwen2.5:7b",
                "size": 4_680_000_000,
                "details": {"parameter_size": "7.6B", "quantization_level": "Q4_K_M"},
            },
        ]
    }


class TestOllamaDetailedListing:
    def _engine(self, payload) -> OllamaEngine:
        engine = OllamaEngine()
        client = MagicMock()
        response = MagicMock()
        response.json.return_value = payload
        response.raise_for_status.return_value = None
        client.get.return_value = response
        engine._client = client
        return engine

    def test_reports_size_and_quantization(self):
        detailed = self._engine(_tags_payload()).list_models_detailed()
        assert detailed[0] == {
            "id": "qwen3:1.7b",
            "size_bytes": 1_359_000_000,
            "parameter_size": "2.0B",
            "quantization": "Q4_K_M",
        }

    def test_tolerates_missing_details(self):
        payload = {"models": [{"name": "custom:latest"}]}
        detailed = self._engine(payload).list_models_detailed()
        assert detailed == [
            {
                "id": "custom:latest",
                "size_bytes": None,
                "parameter_size": "",
                "quantization": "",
            }
        ]

    def test_drops_entries_without_a_name(self):
        payload = {"models": [{"size": 100}, {"name": "ok:latest"}]}
        ids = [m["id"] for m in self._engine(payload).list_models_detailed()]
        assert ids == ["ok:latest"]

    def test_unreachable_engine_returns_empty(self):
        engine = OllamaEngine()
        client = MagicMock()
        client.get.side_effect = httpx.ConnectError("refused")
        engine._client = client
        assert engine.list_models_detailed() == []


class TestWrappersForwardDetails:
    """Each wrapper must forward, not inherit the ids-only default."""

    @pytest.fixture
    def inner(self):
        engine = MagicMock()
        engine.list_models.return_value = ["qwen3:1.7b", "qwen2.5:7b"]
        engine.list_models_detailed.return_value = [
            {"id": "qwen3:1.7b", "size_bytes": 1_359_000_000},
            {"id": "qwen2.5:7b", "size_bytes": 4_680_000_000},
        ]
        return engine

    def test_instrumented_engine(self, inner):
        from openeidon.telemetry.instrumented_engine import InstrumentedEngine

        wrapped = InstrumentedEngine(inner, MagicMock())
        assert wrapped.list_models_detailed()[0]["size_bytes"] == 1_359_000_000

    def test_guardrails_engine_delegates(self, inner):
        # GuardrailsEngine needs the compiled scanner to construct, so assert
        # the delegation at the class level: it must define the method rather
        # than inherit the ids-only default.
        from openeidon.engine._stubs import InferenceEngine
        from openeidon.security.guardrails import GuardrailsEngine

        assert (
            GuardrailsEngine.list_models_detailed
            is not InferenceEngine.list_models_detailed
        )
        forwarded = GuardrailsEngine.list_models_detailed.__get__(
            type("Stub", (), {"_engine": inner})()
        )
        assert forwarded()[0]["size_bytes"] == 1_359_000_000

    def test_multi_engine_merges_sources(self, inner):
        from openeidon.engine.multi import MultiEngine

        other = MagicMock()
        other.list_models.return_value = ["cloud:model"]
        other.list_models_detailed.return_value = [
            {"id": "cloud:model", "size_bytes": None}
        ]
        multi = MultiEngine([("ollama", inner), ("cloud", other)])
        by_id = {m["id"]: m for m in multi.list_models_detailed()}
        assert by_id["qwen3:1.7b"]["size_bytes"] == 1_359_000_000
        assert "cloud:model" in by_id

    def test_multi_engine_keeps_models_whose_engine_reports_nothing(self, inner):
        from openeidon.engine.multi import MultiEngine

        broken = MagicMock()
        broken.list_models.return_value = ["mystery:model"]
        broken.list_models_detailed.side_effect = RuntimeError("not supported")
        multi = MultiEngine([("ollama", inner), ("broken", broken)])
        ids = [m["id"] for m in multi.list_models_detailed()]
        assert "mystery:model" in ids

    def test_base_default_reports_ids_only(self):
        from openeidon.engine._stubs import InferenceEngine

        class Minimal(InferenceEngine):
            def generate(self, *a, **k):  # pragma: no cover - unused
                raise NotImplementedError

            def stream(self, *a, **k):  # pragma: no cover - unused
                raise NotImplementedError

            def list_models(self):
                return ["a", "b"]

            def health(self):
                return True

        assert Minimal().list_models_detailed() == [{"id": "a"}, {"id": "b"}]


class TestLightestModel:
    def test_picks_the_smallest_by_size(self):
        engine = MagicMock()
        engine.list_models_detailed.return_value = [
            {"id": "big", "size_bytes": 4_000_000_000},
            {"id": "small", "size_bytes": 1_000_000_000},
        ]
        assert lightest_model(engine) == "small"

    def test_falls_back_when_no_sizes_are_reported(self):
        engine = MagicMock()
        engine.list_models_detailed.return_value = [{"id": "only"}]
        engine.list_models.return_value = ["only"]
        assert lightest_model(engine) == "only"

    def test_no_engine(self):
        assert lightest_model(None) == ""

    def test_engine_failure_is_empty(self):
        engine = MagicMock()
        engine.list_models_detailed.side_effect = ConnectionError("down")
        assert lightest_model(engine) == ""
