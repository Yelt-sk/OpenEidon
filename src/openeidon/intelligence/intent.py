"""Intent classification for desktop commands.

Turns a user utterance into ``(category, subject)`` so the assistant can route
"включи spotify" to the app launcher, "включи acdc" to media playback, and
"включи тихо" to a system command — cases that a keyword matcher alone
confuses, which is why an LLM pass exists at all.

Two stages:

1. :func:`rule_intent` — a deterministic pass over unambiguous phrasings. It
   costs nothing and keeps the common cases off the model.
2. :func:`classify_intent` — falls back to the model when the rules abstain.

Both return an :class:`Intent`. Parsing and validation live in
:func:`parse_intent_payload`, which is pure and covered by tests without a
model in the loop.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger(__name__)

#: Everything the router knows how to act on.
CATEGORIES = ("app", "media", "system_cmd", "chat")

DEFAULT_CATEGORY = "chat"

SYSTEM_PROMPT = (
    "You classify a user request into one of four categories and extract the"
    ' subject. Return only JSON: {"category":"...","subject":"..."}\n'
    "Categories:\n"
    '- "app" — launch/open/turn on a desktop application'
    " (e.g. Spotify, Telegram, VS Code, notepad)\n"
    '- "media" — play music, video, or audio content by name/artist'
    " (e.g. ACDC, jazz, a song)\n"
    '- "system_cmd" — system-level command: volume up/down/mute, brightness,'
    " screen off\n"
    '- "chat" — conversation, question, task not fitting above\n'
    "Examples:\n"
    '{"category":"app","subject":"Spotify"} for "включи spotify"\n'
    '{"category":"media","subject":"ACDC"} for "включи acdc"\n'
    '{"category":"system_cmd","subject":"volume down"} for "включи тихо"\n'
    '{"category":"chat","subject":""} for "расскажи про медведей"'
)


@dataclass(frozen=True)
class Intent:
    """A classified request."""

    category: str
    subject: str = ""
    #: "rule" when decided without a model, "model" otherwise, "fallback" on error
    source: str = "model"

    def to_dict(self) -> dict[str, str]:
        return {"category": self.category, "subject": self.subject}


# --------------------------------------------------------------------------
# Stage 1 — deterministic rules
# --------------------------------------------------------------------------

#: Volume/brightness/screen phrasings, RU and EN.
_SYSTEM_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\b(потише|тише|тихо|убав(ь|ить)\s+звук|volume\s*down|quieter)\b", "volume down"),
    (r"\b(погромче|громче|прибав(ь|ить)\s+звук|volume\s*up|louder)\b", "volume up"),
    (r"\b(выключи\s+звук|без\s+звука|заглуши|мьют|mute|silence)\b", "mute"),
    (r"\b(верни\s+звук|включи\s+звук|unmute)\b", "unmute"),
    (r"\b(ярче|поярче|brightness\s*up)\b", "brightness up"),
    (r"\b(темнее|потемнее|brightness\s*down)\b", "brightness down"),
    (r"\b(выключи\s+экран|погаси\s+экран|screen\s+off)\b", "screen off"),
)

#: Question openers that are conversation, never commands.
_CHAT_PATTERNS = (
    r"^\s*(расскажи|объясни|почему|как\s+(?:мне\s+)?(?:лучше|правильно)|что\s+такое"
    r"|кто\s+так(?:ой|ая)|tell\s+me|explain|why|what\s+is|who\s+is|how\s+do)\b"
)


def rule_intent(query: str) -> Optional[Intent]:
    """Classify without a model, or return ``None`` when it is ambiguous."""
    text = " ".join(query.strip().lower().split())
    if not text:
        return None

    for pattern, subject in _SYSTEM_PATTERNS:
        if re.search(pattern, text):
            return Intent("system_cmd", subject, source="rule")

    if re.search(_CHAT_PATTERNS, text):
        return Intent("chat", "", source="rule")

    return None


# --------------------------------------------------------------------------
# Stage 2 — model
# --------------------------------------------------------------------------


def extract_json_object(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of a model reply, tolerating code fences."""
    body = text.strip()
    if body.startswith("```"):
        lines = body.splitlines()
        if len(lines) >= 3:
            body = "\n".join(lines[1:-1]).strip()
    start = body.find("{")
    end = body.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("model did not return a JSON object")
    return json.loads(body[start : end + 1])


def parse_intent_payload(raw: str, *, source: str = "model") -> Intent:
    """Turn a raw model reply into a validated :class:`Intent`.

    Anything unparseable or out of vocabulary degrades to ``chat`` — routing a
    misread command into conversation is harmless, launching the wrong app is
    not.
    """
    try:
        payload = extract_json_object(raw)
    except (ValueError, json.JSONDecodeError):
        logger.debug("Intent reply was not JSON: %r", raw[:200])
        return Intent(DEFAULT_CATEGORY, "", source="fallback")

    category = str(payload.get("category", "")).strip().lower()
    subject = str(payload.get("subject", "")).strip()
    if category not in CATEGORIES:
        logger.debug("Intent category %r not recognised", category)
        return Intent(DEFAULT_CATEGORY, "", source="fallback")
    if category == DEFAULT_CATEGORY:
        subject = ""
    return Intent(category, subject, source=source)


def classify_intent(engine: Any, query: str, *, model: str = "") -> Intent:
    """Classify *query*, using the rules first and the model only if needed."""
    text = query.strip()
    if not text:
        return Intent(DEFAULT_CATEGORY, "", source="rule")

    decided = rule_intent(text)
    if decided is not None:
        return decided

    if engine is None:
        return Intent(DEFAULT_CATEGORY, "", source="fallback")

    from openeidon.core.types import Message, Role

    try:
        response = engine.generate(
            [
                Message(role=Role.SYSTEM, content=SYSTEM_PROMPT),
                Message(role=Role.USER, content=text),
            ],
            model=model,
            temperature=0,
            max_tokens=40,
        )
    except Exception:
        logger.exception("Intent classification failed; treating as chat")
        return Intent(DEFAULT_CATEGORY, "", source="fallback")

    return parse_intent_payload(response.get("content", ""))
