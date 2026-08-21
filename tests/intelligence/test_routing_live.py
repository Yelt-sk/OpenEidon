"""Routing eval: does the model pick the right tool for a real request?

Marked ``live`` because it needs a running engine with the configured model.
Run it against your own setup with::

    uv run pytest -m live tests/intelligence/test_routing_live.py -v

It scores the exact schemas the app ships (``frontend/src/lib/routing-tools
.json``) rather than a copy, because a copy drifts: an earlier throwaway
harness parsed the definitions out of TypeScript and silently paired tool
names with parameter descriptions, which made every number it produced
meaningless.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

SCHEMA_PATH = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" /
    "routing-tools.json"
)

#: (request, tools that would be a correct choice). An empty set means the
#: request is conversation and no tool should fire.
CASES: list[tuple[str, set[str]]] = [
    # Opening applications
    ("открой vs code", {"open_app"}),
    ("включи vs studio", {"open_app"}),
    ("запусти блокнот", {"open_app"}),
    ("open calculator", {"open_app"}),
    # Opening sites
    ("открой ютуб", {"open_site", "open_app"}),
    ("открой гитхаб", {"open_site", "open_app"}),
    # Media
    ("включи рок", {"play_youtube"}),
    ("включи acdc", {"play_youtube"}),
    ("поставь музыку", {"play_youtube"}),
    ("хочу послушать джаз", {"play_youtube"}),
    # Work setup
    ("включи софт для работы", {"open_app", "open_work_apps"}),
    ("открой рабочие программы", {"open_app", "open_work_apps"}),
    # Memory
    ("запомни, я пользуюсь figma", {"save_preference"}),
    ("запомни что я люблю джаз", {"save_preference"}),
    # Reminders
    ("напомни через 10 минут выпить воды", {"set_reminder"}),
    ("поставь таймер на 5 минут", {"set_reminder"}),
    ("какие у меня напоминания", {"list_reminders"}),
    # System inspection
    ("что запущено на компьютере", {"list_running_processes"}),
    ("какие программы установлены", {"list_installed_apps"}),
    # Web
    ("найди в интернете новости про ai", {"web_search"}),
    ("что нового в мире технологий", {"web_search"}),
    # Files
    ("покажи файлы на рабочем столе", {"list_files"}),
    ("открой мою курсовую", {"find_and_open_file"}),
    # Conversation — no tool belongs here
    ("расскажи про медведей", set()),
    ("сколько будет 2+2", set()),
    ("как дела", set()),
    ("объясни как работает квантовый компьютер", set()),
]

#: Below this the router is not fit for use; the measured score on the
#: development machine was 14/14 on a smaller set, so leave headroom for
#: model and phrasing variation rather than pinning an exact number.
MIN_ACCURACY = 0.75


def _load_schemas() -> list[dict]:
    schemas = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    names = [s["function"]["name"] for s in schemas]
    assert len(names) == len(set(names)), "duplicate tool names in the schemas"
    return schemas


@pytest.fixture(scope="module")
def schemas() -> list[dict]:
    return _load_schemas()


@pytest.fixture(scope="module")
def router():
    """A callable that routes one phrase, or skips when nothing is running."""
    import openeidon.engine  # noqa: F401 -- register engines
    from openeidon.core.registry import EngineRegistry
    from openeidon.core.types import Message, Role
    from openeidon.intelligence.model_resolver import resolve_model

    if not EngineRegistry.contains("ollama"):
        pytest.skip("ollama engine is not registered")
    engine = EngineRegistry.create("ollama")
    if not engine.health():
        pytest.skip("no local engine reachable")
    model = resolve_model(engine)
    if not model:
        pytest.skip("no model installed")

    schemas = _load_schemas()
    system = (
        "You route requests for Eidon, an assistant running on this Windows PC.\n"
        "Call a tool when the user asks the computer to do something.\n"
        "Answer without any tool for conversation and general knowledge questions.\n"
        "The object of the request decides which tool: opening a program or a "
        'site is never a request for music, even when the user says "включи".'
    )

    def route(phrase: str) -> set[str]:
        result = engine.generate(
            [
                Message(role=Role.SYSTEM, content=system),
                Message(role=Role.USER, content=phrase),
            ],
            model=model,
            temperature=0,
            max_tokens=200,
            tools=schemas,
        )
        return {call["name"] for call in result.get("tool_calls") or []}

    return route


class TestSchemas:
    """These run without a model — the definitions must be well-formed."""

    def test_every_tool_has_a_description(self, schemas):
        for entry in schemas:
            fn = entry["function"]
            assert fn.get("description"), f"{fn['name']} has no description"

    def test_required_parameters_are_declared(self, schemas):
        for entry in schemas:
            fn = entry["function"]
            params = fn.get("parameters", {})
            props = params.get("properties", {})
            for name in params.get("required", []):
                assert name in props, f"{fn['name']}: required {name!r} not declared"

    def test_no_tool_without_an_executor(self, schemas):
        """Every offered tool must exist in the frontend switch that runs it.

        Offering a tool the executor ignores means the model can route a
        request into a no-op.
        """
        executor = (
            Path(__file__).resolve().parents[2]
            / "frontend" / "src" / "components" / "Chat" / "InputArea.tsx"
        ).read_text(encoding="utf-8")
        for entry in schemas:
            name = entry["function"]["name"]
            assert f"case '{name}'" in executor, f"no executor case for {name}"


@pytest.mark.live
class TestRoutingAccuracy:
    def test_meets_the_accuracy_floor(self, router):
        misses = []
        for phrase, expected in CASES:
            got = router(phrase)
            ok = bool(got & expected) if expected else not got
            if not ok:
                misses.append(f"{phrase!r} -> {sorted(got) or 'no tool'}")

        accuracy = 1 - len(misses) / len(CASES)
        report = "\n".join(f"  {m}" for m in misses)
        assert accuracy >= MIN_ACCURACY, (
            f"routing accuracy {accuracy:.0%} below {MIN_ACCURACY:.0%}\n{report}"
        )

    @pytest.mark.parametrize(
        "phrase", ["расскажи про медведей", "сколько будет 2+2", "как дела"]
    )
    def test_conversation_never_triggers_a_tool(self, router, phrase):
        """A wrong tool on a chat message opens apps the user did not ask for,
        which is worse than a missed tool."""
        assert router(phrase) == set()

    def test_opening_a_program_does_not_start_music(self, router):
        """The verb "включи" covers both; only the object distinguishes them."""
        for phrase in ("включи vs studio", "включи софт для работы"):
            assert "play_youtube" not in router(phrase), phrase
