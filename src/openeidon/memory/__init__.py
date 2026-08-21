"""Structured long-term memory (people, projects, preferences).

Document and vector retrieval live in ``openeidon.tools.storage``; this package
holds the small set of curated facts the assistant should always know.
"""

from __future__ import annotations

from openeidon.memory.facts import KINDS, Fact, FactStore, get_fact_store

__all__ = ["Fact", "FactStore", "KINDS", "get_fact_store"]
