"""Agents primitive — multi-turn reasoning and tool use."""

from __future__ import annotations

import logging

from openeidon.agents._stubs import (
    AgentContext,
    AgentResult,
    BaseAgent,
    ToolUsingAgent,
)

logger = logging.getLogger(__name__)

# Import agent modules to trigger @AgentRegistry.register() decorators
try:
    import openeidon.agents.simple  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.orchestrator  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.native_react  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.native_openhands  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.react  # noqa: F401 -- backward-compat shim
except ImportError:
    pass

try:
    import openeidon.agents.openhands  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.rlm  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.claude_code  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.operative  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.monitor  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.monitor_operative  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.deep_research  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.agents.morning_digest  # noqa: F401
except ImportError:
    pass

# Registry alias: "react" -> NativeReActAgent (for backward compat)
try:
    from openeidon.core.registry import AgentRegistry

    if AgentRegistry.contains("native_react") and not AgentRegistry.contains("react"):
        AgentRegistry.register_value("react", AgentRegistry.get("native_react"))
except Exception as exc:
    logger.debug("Registry alias 'react' creation skipped: %s", exc)

__all__ = ["AgentContext", "AgentResult", "BaseAgent", "ToolUsingAgent"]
