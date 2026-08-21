"""Skill system — reusable multi-tool compositions."""

from openeidon.skills.dependency import (
    DependencyCycleError,
    DepthExceededError,
    build_dependency_graph,
    compute_capability_union,
    validate_dependencies,
)
from openeidon.skills.executor import SkillExecutor, SkillResult
from openeidon.skills.importer import ImportResult, SkillImporter
from openeidon.skills.loader import (
    discover_skills,
    load_skill,
    load_skill_directory,
    load_skill_markdown,
)
from openeidon.skills.manager import SkillManager
from openeidon.skills.parser import SkillParseError, SkillParser
from openeidon.skills.tool_adapter import SkillTool
from openeidon.skills.tool_translator import TOOL_TRANSLATION, ToolTranslator
from openeidon.skills.types import SkillManifest, SkillStep

__all__ = [
    "DependencyCycleError",
    "DepthExceededError",
    "ImportResult",
    "SkillExecutor",
    "SkillImporter",
    "SkillManager",
    "SkillManifest",
    "SkillParseError",
    "SkillParser",
    "SkillResult",
    "SkillStep",
    "SkillTool",
    "TOOL_TRANSLATION",
    "ToolTranslator",
    "build_dependency_graph",
    "compute_capability_union",
    "discover_skills",
    "load_skill",
    "load_skill_directory",
    "load_skill_markdown",
    "validate_dependencies",
]
