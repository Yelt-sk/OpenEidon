"""Tools primitive — tool system with ABC interface and built-in tools."""

from __future__ import annotations

from openeidon.tools._stubs import BaseTool, ToolExecutor, ToolSpec

# Import built-in tools to trigger @ToolRegistry.register() decorators.
# Each is wrapped in try/except so the package loads even before the
# individual tool modules are created.
try:
    import openeidon.tools.calculator  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.think  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.retrieval  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.llm_tool  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.file_read  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.web_search  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.code_interpreter  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.code_interpreter_docker  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.repl  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.storage_tools  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.mcp_adapter  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.channel_tools  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.http_request  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.shell_exec  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.memory_manage  # noqa: F401
except ImportError:
    pass
try:
    import openeidon.tools.user_profile_manage  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.preferences_tool  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.skill_manage  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.file_write  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.apply_patch  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.git_tool  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.db_query  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.pdf_tool  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.image_tool  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.audio_tool  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.knowledge_tools  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.text_to_speech  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.notes_tool  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.reminder_tool  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.project_files_tool  # noqa: F401
except ImportError:
    pass

try:
    import openeidon.tools.digest_collect  # noqa: F401
except ImportError:
    pass

__all__ = ["BaseTool", "ToolExecutor", "ToolSpec"]
