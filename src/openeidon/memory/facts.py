"""Structured long-term memory: people, projects, and preferences.

This is deliberately separate from the document/vector memory backends in
``openeidon.tools.storage``: those answer "what did I read about X", this one
holds a small set of curated facts the assistant should always know — who the
user works with, what they are building, how they like things done. It backs
the MEMORY section of the FOX sidebar.

Storage is a single SQLite file at ``~/.openeidon/memory_facts.db``.
"""

from __future__ import annotations

import json
import sqlite3
import time
import unicodedata
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

#: The three fact kinds surfaced in the sidebar.
KINDS = ("person", "project", "preference")


def _name_key(name: str) -> str:
    """Normalised form used for uniqueness and lookup.

    ``str.casefold()`` folds Unicode, which SQLite's NOCASE collation does
    not: it only maps ASCII A-Z, so Cyrillic names differing in case were
    stored as separate facts.
    """
    return unicodedata.normalize("NFKC", name.strip()).casefold()


def default_db_path() -> Path:
    return Path.home() / ".openeidon" / "memory_facts.db"


@dataclass
class Fact:
    """One remembered fact."""

    id: str
    kind: str
    name: str
    detail: str = ""
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = 0.0
    updated_at: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class FactStore:
    """CRUD over the structured memory facts table."""

    def __init__(self, db_path: str | Path = "") -> None:
        self._db_path = Path(db_path) if db_path else default_db_path()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._init_schema()

    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS facts (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                -- Case-folded name. SQLite's NOCASE collation only folds
                -- ASCII, so "Аня" and "аня" were two different people.
                name_key TEXT NOT NULL DEFAULT '',
                detail TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_facts_kind ON facts(kind);
            """
        )
        self._migrate_name_key()
        self._conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_facts_kind_name_key"
            " ON facts(kind, name_key)"
        )
        self._conn.commit()

    def _migrate_name_key(self) -> None:
        """Add and backfill ``name_key`` on databases created before it.

        Existing rows carry an empty key, which would collide the moment a
        second one is written, so they are filled in before the unique index
        is created. Rows that were duplicates under the old ASCII-only
        collation (``Аня`` and ``аня``) are merged: the oldest wins, since it
        holds the detail the user gave first.
        """
        columns = {
            row["name"] for row in self._conn.execute("PRAGMA table_info(facts)")
        }
        if "name_key" not in columns:
            self._conn.execute(
                "ALTER TABLE facts ADD COLUMN name_key TEXT NOT NULL DEFAULT ''"
            )

        rows = self._conn.execute(
            "SELECT id, kind, name, name_key, created_at FROM facts"
            " ORDER BY created_at"
        ).fetchall()
        seen: dict[tuple[str, str], str] = {}
        for row in rows:
            key = _name_key(row["name"])
            identity = (row["kind"], key)
            if identity in seen:
                self._conn.execute("DELETE FROM facts WHERE id=?", (row["id"],))
                continue
            seen[identity] = row["id"]
            if row["name_key"] != key:
                self._conn.execute(
                    "UPDATE facts SET name_key=? WHERE id=?", (key, row["id"])
                )
        self._conn.commit()

    # ------------------------------------------------------------------

    @staticmethod
    def _validate_kind(kind: str) -> str:
        normalized = kind.strip().lower()
        if normalized not in KINDS:
            raise ValueError(f"kind must be one of {KINDS}, got {kind!r}")
        return normalized

    @staticmethod
    def _row_to_fact(row: sqlite3.Row) -> Fact:
        return Fact(
            id=row["id"],
            kind=row["kind"],
            name=row["name"],
            detail=row["detail"],
            tags=json.loads(row["tags"]),
            metadata=json.loads(row["metadata"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def upsert(
        self,
        kind: str,
        name: str,
        *,
        detail: str = "",
        tags: Optional[Iterable[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Fact:
        """Insert a fact, or update the existing one with the same kind+name."""
        kind = self._validate_kind(kind)
        name = name.strip()
        if not name:
            raise ValueError("name is required")
        now = time.time()
        existing = self.find(kind, name)
        tag_list = sorted({t.strip() for t in (tags or []) if t.strip()})

        if existing is not None:
            merged_meta = {**existing.metadata, **(metadata or {})}
            merged_tags = sorted(set(existing.tags) | set(tag_list))
            self._conn.execute(
                "UPDATE facts SET detail=?, tags=?, metadata=?, updated_at=?"
                " WHERE id=?",
                (
                    detail or existing.detail,
                    json.dumps(merged_tags, ensure_ascii=False),
                    json.dumps(merged_meta, ensure_ascii=False),
                    now,
                    existing.id,
                ),
            )
            self._conn.commit()
            return self.get(existing.id)  # type: ignore[return-value]

        fact_id = f"fact_{uuid.uuid4().hex[:16]}"
        self._conn.execute(
            "INSERT INTO facts (id, kind, name, name_key, detail, tags,"
            " metadata, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                fact_id,
                kind,
                name,
                _name_key(name),
                detail,
                json.dumps(tag_list, ensure_ascii=False),
                json.dumps(metadata or {}, ensure_ascii=False),
                now,
                now,
            ),
        )
        self._conn.commit()
        return self.get(fact_id)  # type: ignore[return-value]

    def get(self, fact_id: str) -> Optional[Fact]:
        row = self._conn.execute(
            "SELECT * FROM facts WHERE id=?", (fact_id,)
        ).fetchone()
        return self._row_to_fact(row) if row else None

    def find(self, kind: str, name: str) -> Optional[Fact]:
        row = self._conn.execute(
            "SELECT * FROM facts WHERE kind=? AND name_key=?",
            (self._validate_kind(kind), _name_key(name)),
        ).fetchone()
        return self._row_to_fact(row) if row else None

    def list(self, kind: str = "", *, limit: int = 200) -> List[Fact]:
        if kind:
            rows = self._conn.execute(
                "SELECT * FROM facts WHERE kind=? ORDER BY updated_at DESC LIMIT ?",
                (self._validate_kind(kind), limit),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM facts ORDER BY updated_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self._row_to_fact(r) for r in rows]

    def search(self, query: str, *, limit: int = 50) -> List[Fact]:
        """Case-insensitive substring search over names and details.

        Filtering happens in Python rather than with SQL ``LIKE``: SQLite
        only case-folds ASCII, so searching "аня" found nothing while "Аня"
        did. The table holds a curated handful of facts, so scanning it is
        cheaper than maintaining a folded copy of every field.
        """
        needle = _name_key(query)
        if not needle:
            return []
        rows = self._conn.execute(
            "SELECT * FROM facts ORDER BY updated_at DESC"
        ).fetchall()
        matches = [
            row
            for row in rows
            if needle in _name_key(row["name"]) or needle in _name_key(row["detail"])
        ]
        return [self._row_to_fact(r) for r in matches[:limit]]

    def delete(self, fact_id: str) -> bool:
        cur = self._conn.execute("DELETE FROM facts WHERE id=?", (fact_id,))
        self._conn.commit()
        return cur.rowcount > 0

    def counts(self) -> Dict[str, int]:
        """Per-kind counts — what the sidebar renders."""
        result = {kind: 0 for kind in KINDS}
        for row in self._conn.execute(
            "SELECT kind, COUNT(*) AS n FROM facts GROUP BY kind"
        ):
            if row["kind"] in result:
                result[row["kind"]] = row["n"]
        return result

    def as_prompt_context(self, *, limit_per_kind: int = 15) -> str:
        """Render the facts as a compact block for a system prompt."""
        sections: List[str] = []
        labels = {
            "person": "People",
            "project": "Projects",
            "preference": "Preferences",
        }
        for kind in KINDS:
            facts = self.list(kind, limit=limit_per_kind)
            if not facts:
                continue
            lines = [
                f"- {f.name}" + (f": {f.detail}" if f.detail else "") for f in facts
            ]
            sections.append(f"{labels[kind]}:\n" + "\n".join(lines))
        return "\n\n".join(sections)

    def close(self) -> None:
        self._conn.close()


_store: Optional[FactStore] = None


def get_fact_store() -> FactStore:
    """Process-wide store instance."""
    global _store
    if _store is None:
        _store = FactStore()
    return _store
