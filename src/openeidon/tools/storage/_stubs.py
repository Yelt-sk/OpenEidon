"""ABC for memory / retrieval backends.

Phase 2 will provide concrete implementations (SQLite/FTS5, FAISS,
ColBERTv2, BM25, Hybrid).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(slots=True)
class RetrievalResult:
    """A single result returned by a memory backend query."""

    content: str
    score: float = 0.0
    source: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


class MemoryBackend(ABC):
    """Base class for all memory / retrieval backends.

    Subclasses must be registered via
    ``@MemoryRegistry.register("name")`` to become discoverable.
    """

    backend_id: str

    @abstractmethod
    def store(
        self,
        content: str,
        *,
        source: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Persist *content* and return a unique document id."""

    @abstractmethod
    def retrieve(
        self,
        query: str,
        *,
        top_k: int = 5,
        **kwargs: Any,
    ) -> List[RetrievalResult]:
        """Search for *query* and return the top-k results."""

    @abstractmethod
    def delete(self, doc_id: str) -> bool:
        """Delete a document by id. Return ``True`` if it existed."""

    @abstractmethod
    def clear(self) -> None:
        """Remove all stored documents."""


__all__ = ["MemoryBackend", "RetrievalResult"]
