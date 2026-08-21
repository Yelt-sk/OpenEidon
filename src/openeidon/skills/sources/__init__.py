"""Skill source resolvers — Hermes, OpenClaw, generic GitHub."""

from openeidon.skills.sources.base import ResolvedSkill, SourceResolver
from openeidon.skills.sources.github import GitHubResolver
from openeidon.skills.sources.hermes import HERMES_REPO_URL, HermesResolver
from openeidon.skills.sources.openclaw import OPENCLAW_REPO_URL, OpenClawResolver

__all__ = [
    "GitHubResolver",
    "HERMES_REPO_URL",
    "HermesResolver",
    "OPENCLAW_REPO_URL",
    "OpenClawResolver",
    "ResolvedSkill",
    "SourceResolver",
]
