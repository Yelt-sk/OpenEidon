"""Tests for intent classification."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from openeidon.intelligence.intent import (
    DEFAULT_CATEGORY,
    Intent,
    classify_intent,
    extract_json_object,
    parse_intent_payload,
    rule_intent,
)


class TestRuleIntent:
    @pytest.mark.parametrize(
        "query,subject",
        [
            ("включи тихо", "volume down"),
            ("сделай потише", "volume down"),
            ("погромче", "volume up"),
            ("выключи звук", "mute"),
            ("mute", "mute"),
            ("выключи экран", "screen off"),
        ],
    )
    def test_system_commands_need_no_model(self, query, subject):
        intent = rule_intent(query)
        assert intent == Intent("system_cmd", subject, source="rule")

    @pytest.mark.parametrize(
        "query",
        ["расскажи про медведей", "что такое энтропия", "explain quantum tunneling"],
    )
    def test_questions_are_chat(self, query):
        intent = rule_intent(query)
        assert intent is not None
        assert intent.category == "chat"
        assert intent.source == "rule"

    @pytest.mark.parametrize(
        "query", ["включи spotify", "включи acdc", "открой vs code"]
    )
    def test_ambiguous_commands_abstain(self, query):
        # These are exactly the cases the model exists for.
        assert rule_intent(query) is None

    def test_empty_abstains(self):
        assert rule_intent("   ") is None

    def test_is_case_and_whitespace_insensitive(self):
        assert rule_intent("  ВЫКЛЮЧИ   ЗВУК ") == Intent(
            "system_cmd", "mute", source="rule"
        )


class TestExtractJsonObject:
    def test_plain_object(self):
        assert extract_json_object('{"a": 1}') == {"a": 1}

    def test_strips_code_fence(self):
        assert extract_json_object('```json\n{"a": 1}\n```') == {"a": 1}

    def test_ignores_surrounding_prose(self):
        assert extract_json_object('Sure! {"a": 1} done') == {"a": 1}

    @pytest.mark.parametrize("bad", ["", "no json here", "}{"])
    def test_rejects_non_objects(self, bad):
        with pytest.raises(ValueError):
            extract_json_object(bad)


class TestParseIntentPayload:
    def test_valid_payload(self):
        intent = parse_intent_payload('{"category":"app","subject":"Spotify"}')
        assert intent == Intent("app", "Spotify", source="model")

    def test_unknown_category_degrades_to_chat(self):
        intent = parse_intent_payload('{"category":"launch_nukes","subject":"x"}')
        assert intent.category == DEFAULT_CATEGORY
        assert intent.subject == ""
        assert intent.source == "fallback"

    def test_unparseable_degrades_to_chat(self):
        assert parse_intent_payload("I think you want Spotify").category == (
            DEFAULT_CATEGORY
        )

    def test_chat_category_drops_subject(self):
        intent = parse_intent_payload('{"category":"chat","subject":"bears"}')
        assert intent.subject == ""

    def test_category_is_normalised(self):
        assert parse_intent_payload('{"category":" App ","subject":"x"}').category == (
            "app"
        )


class TestClassifyIntent:
    def test_rules_short_circuit_before_the_model(self):
        engine = MagicMock()
        intent = classify_intent(engine, "включи тихо")
        assert intent.category == "system_cmd"
        engine.generate.assert_not_called()

    def test_falls_through_to_model(self):
        engine = MagicMock()
        engine.generate.return_value = {
            "content": '{"category":"media","subject":"ACDC"}'
        }
        intent = classify_intent(engine, "включи acdc")
        assert intent == Intent("media", "ACDC", source="model")
        engine.generate.assert_called_once()

    def test_model_failure_degrades_to_chat(self):
        engine = MagicMock()
        engine.generate.side_effect = RuntimeError("engine down")
        intent = classify_intent(engine, "включи acdc")
        assert intent.category == DEFAULT_CATEGORY
        assert intent.source == "fallback"

    def test_no_engine_degrades_to_chat(self):
        assert classify_intent(None, "включи acdc").category == DEFAULT_CATEGORY

    def test_empty_query_is_chat_without_calling_the_model(self):
        engine = MagicMock()
        assert classify_intent(engine, "   ").category == DEFAULT_CATEGORY
        engine.generate.assert_not_called()

    def test_passes_model_name_through(self):
        engine = MagicMock()
        engine.generate.return_value = {"content": '{"category":"chat","subject":""}'}
        classify_intent(engine, "включи acdc", model="qwen3:8b")
        assert engine.generate.call_args.kwargs["model"] == "qwen3:8b"

    def test_uses_deterministic_settings(self):
        engine = MagicMock()
        engine.generate.return_value = {"content": '{"category":"chat","subject":""}'}
        classify_intent(engine, "включи acdc")
        kwargs = engine.generate.call_args.kwargs
        assert kwargs["temperature"] == 0
        assert kwargs["max_tokens"] == 40


class TestIntentRoute:
    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient

        from openeidon.server.app import create_app

        engine = MagicMock()
        engine.generate.return_value = {
            "content": '{"category":"app","subject":"Spotify"}'
        }
        return TestClient(create_app(engine=engine, model="test-model"))

    def test_requires_a_query(self, client):
        resp = client.post("/v1/intent/classify", json={"query": " "})
        assert resp.status_code == 400

    def test_returns_category_and_subject(self, client):
        body = client.post("/v1/intent/classify", json={"query": "включи spotify"})
        assert body.status_code == 200
        assert body.json() == {"category": "app", "subject": "Spotify"}

    def test_rule_path_does_not_need_the_model(self, client):
        body = client.post("/v1/intent/classify", json={"query": "включи тихо"})
        assert body.json() == {"category": "system_cmd", "subject": "volume down"}
