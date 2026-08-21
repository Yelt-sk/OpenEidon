"""Intelligence primitive — the model definition and catalog."""

from __future__ import annotations

from openjarvis.intelligence.model_catalog import (
    BUILTIN_MODELS,
    merge_discovered_models,
    register_builtin_models,
)

__all__ = ["BUILTIN_MODELS", "merge_discovered_models", "register_builtin_models"]
