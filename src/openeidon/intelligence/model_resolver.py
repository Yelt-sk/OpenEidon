"""One place that answers "which model should this call use?".

Before this existed, half a dozen call sites each carried their own literal
fallback (``qwen3.5:9b``, ``qwen3.5:4b``, ``qwen3.5:2b``) — names from a model
family that does not exist, so every one of those paths failed on a machine
that had not been set up to match. Resolution order:

1. an explicit model passed by the caller
2. ``config.intelligence.default_model``
3. whatever the engine actually has installed
4. ``config.intelligence.fallback_model``

The result may be an empty string: engines treat that as "use your own
default", which is a better failure mode than naming a model nobody has.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _config_model(config: Any, field: str) -> str:
    intelligence = getattr(config, "intelligence", None)
    return (getattr(intelligence, field, "") or "").strip()


def resolve_model(
    engine: Any = None,
    *,
    explicit: str = "",
    config: Any = None,
    server_model: str = "",
) -> str:
    """Return the model identifier to use, or ``""`` to let the engine decide.

    Parameters
    ----------
    engine:
        Inference engine consulted via ``list_models()`` when nothing is
        configured. Optional.
    explicit:
        A model the caller was given directly; always wins.
    config:
        ``EidonConfig``-like object providing ``intelligence.default_model``
        and ``intelligence.fallback_model``.
    server_model:
        The model the running server was started with, checked after the
        configured default and before engine discovery.
    """
    if explicit and explicit.strip():
        return explicit.strip()

    configured = _config_model(config, "default_model")
    if configured:
        return configured

    if server_model and server_model.strip():
        return server_model.strip()

    if engine is not None:
        try:
            models = engine.list_models()
        except Exception as exc:  # engine offline, misconfigured, or stubbed
            logger.debug("Could not list models from engine: %s", exc)
        else:
            if models:
                first = models[0]
                # Engines return either plain ids or dicts describing a model.
                if isinstance(first, dict):
                    return str(first.get("id") or first.get("name") or "")
                return str(first)

    return _config_model(config, "fallback_model")


def resolve_model_for_app(app_state: Any, explicit: str = "") -> str:
    """Resolve a model from a FastAPI ``app.state``."""
    return resolve_model(
        getattr(app_state, "engine", None),
        explicit=explicit,
        config=getattr(app_state, "config", None),
        server_model=getattr(app_state, "model", "") or "",
    )


def lightest_model(engine: Any) -> str:
    """Return the smallest installed model by on-disk size, or ``""``.

    Used as the default for delegated coding sessions: those run many turns,
    so the cheapest model that works is the right starting point, and the
    user can pick a heavier one explicitly.
    """
    if engine is None:
        return ""
    try:
        detailed = engine.list_models_detailed()
    except Exception as exc:
        logger.debug("Could not list detailed models: %s", exc)
        return ""

    sized = [
        (entry.get("size_bytes") or 0, entry.get("id", ""))
        for entry in detailed
        if entry.get("id") and entry.get("size_bytes")
    ]
    if not sized:
        # No sizes reported — fall back to whatever the engine lists first.
        return resolve_model(engine)
    sized.sort()
    return sized[0][1]


__all__ = ["lightest_model", "resolve_model", "resolve_model_for_app"]


def resolve_model_or(default: str, **kwargs: Any) -> str:
    """Like :func:`resolve_model`, but substitute *default* when it resolves
    to nothing. For CLI commands that must print or pass *some* name."""
    resolved: Optional[str] = resolve_model(**kwargs)
    return resolved or default
