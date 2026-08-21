"""Tests for the structured memory fact store and its tool."""

from __future__ import annotations

import pytest

from openeidon.memory.facts import FactStore


@pytest.fixture
def store(tmp_path):
    s = FactStore(tmp_path / "facts.db")
    yield s
    s.close()


class TestFactStore:
    def test_upsert_and_get(self, store):
        fact = store.upsert("person", "Ann", detail="designer", tags=["work"])
        assert fact.kind == "person"
        assert fact.name == "Ann"
        assert store.get(fact.id).detail == "designer"

    def test_upsert_is_idempotent_on_kind_and_name(self, store):
        first = store.upsert("project", "Eidon", detail="assistant")
        second = store.upsert("project", "eidon", tags=["active"])
        assert first.id == second.id
        assert second.detail == "assistant"  # detail preserved when not given
        assert second.tags == ["active"]
        assert store.counts()["project"] == 1

    def test_kinds_do_not_collide(self, store):
        a = store.upsert("person", "Eidon")
        b = store.upsert("project", "Eidon")
        assert a.id != b.id

    def test_rejects_unknown_kind(self, store):
        with pytest.raises(ValueError, match="kind must be one of"):
            store.upsert("robot", "R2D2")

    def test_rejects_empty_name(self, store):
        with pytest.raises(ValueError, match="name is required"):
            store.upsert("person", "   ")

    def test_list_filters_by_kind(self, store):
        store.upsert("person", "Ann")
        store.upsert("project", "Eidon")
        assert [f.name for f in store.list("person")] == ["Ann"]
        assert len(store.list()) == 2

    def test_search_matches_name_and_detail(self, store):
        store.upsert("person", "Ann", detail="designer, works Tuesdays")
        assert [f.name for f in store.search("designer")] == ["Ann"]
        assert [f.name for f in store.search("Ann")] == ["Ann"]
        assert store.search("nothing") == []

    def test_unicode_roundtrip(self, store):
        store.upsert("person", "Аня", detail="дизайнер")
        found = store.search("дизайнер")
        assert found[0].name == "Аня"
        assert found[0].detail == "дизайнер"

    def test_delete(self, store):
        fact = store.upsert("preference", "language", detail="ru")
        assert store.delete(fact.id) is True
        assert store.get(fact.id) is None
        assert store.delete(fact.id) is False

    def test_counts_covers_all_kinds(self, store):
        assert store.counts() == {"person": 0, "project": 0, "preference": 0}
        store.upsert("person", "Ann")
        assert store.counts()["person"] == 1

    def test_prompt_context_groups_by_kind(self, store):
        store.upsert("person", "Ann", detail="designer")
        store.upsert("preference", "language", detail="Russian")
        context = store.as_prompt_context()
        assert "People:" in context
        assert "- Ann: designer" in context
        assert "Preferences:" in context
        assert "Projects:" not in context  # empty kinds are skipped

    def test_persists_across_instances(self, tmp_path):
        path = tmp_path / "facts.db"
        first = FactStore(path)
        first.upsert("project", "Eidon", detail="assistant")
        first.close()
        second = FactStore(path)
        assert second.list("project")[0].detail == "assistant"
        second.close()


class TestMemoryFactsTool:
    def _tool(self, store, monkeypatch):
        from openeidon.tools.memory_facts_tool import MemoryFactsTool

        monkeypatch.setattr(
            "openeidon.memory.get_fact_store", lambda: store, raising=False
        )
        return MemoryFactsTool()

    def test_rejects_unknown_action(self, store, monkeypatch):
        result = self._tool(store, monkeypatch).execute(action="explode")
        assert not result.success

    def test_remember_requires_kind_and_name(self, store, monkeypatch):
        result = self._tool(store, monkeypatch).execute(action="remember", name="Ann")
        assert not result.success

    def test_remember_then_list(self, store, monkeypatch):
        tool = self._tool(store, monkeypatch)
        remembered = tool.execute(
            action="remember", kind="person", name="Ann", detail="designer"
        )
        assert remembered.success
        listed = tool.execute(action="list", kind="person")
        assert "Ann" in listed.content

    def test_recall_requires_query(self, store, monkeypatch):
        result = self._tool(store, monkeypatch).execute(action="recall")
        assert not result.success

    def test_forget_unknown_fact_fails(self, store, monkeypatch):
        result = self._tool(store, monkeypatch).execute(
            action="forget", kind="person", name="Nobody"
        )
        assert not result.success

    def test_registered_via_tools_package_import(self):
        import importlib
        import sys

        import openeidon.tools as tools_pkg
        from openeidon.core.registry import ToolRegistry

        sys.modules.pop("openeidon.tools.memory_facts_tool", None)
        importlib.reload(tools_pkg)
        assert ToolRegistry.contains("memory_facts")
