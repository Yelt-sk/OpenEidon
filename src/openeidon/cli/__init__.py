"""Command-line interface for OpenEidon (Click-based).

Subcommands are loaded lazily so ``eidon <cmd>`` only imports the module it
needs; eager imports here previously dominated CLI cold-start time.
"""

from __future__ import annotations

import importlib

import click

import openeidon

#: command name -> "module:attr" — imported on first use
_LAZY_COMMANDS: dict[str, str] = {
    "init": "openeidon.cli.init_cmd:init",
    "ask": "openeidon.cli.ask:ask",
    "chat": "openeidon.cli.chat_cmd:chat",
    "serve": "openeidon.cli.serve:serve",
    "model": "openeidon.cli.model:model",
    "memory": "openeidon.cli.memory_cmd:memory",
    "telemetry": "openeidon.cli.telemetry_cmd:telemetry",
    "bench": "openeidon.cli.bench_cmd:bench",
    "channel": "openeidon.cli.channel_cmd:channel",
    "channels": "openeidon.cli.channels_cmd:channels",
    "scheduler": "openeidon.cli.scheduler_cmd:scheduler",
    "doctor": "openeidon.cli.doctor_cmd:doctor",
    "agents": "openeidon.cli.agent_cmd:agent",
    "workflow": "openeidon.cli.workflow_cmd:workflow",
    "skill": "openeidon.cli.skill_cmd:skill",
    "start": "openeidon.cli.daemon_cmd:start",
    "stop": "openeidon.cli.daemon_cmd:stop",
    "restart": "openeidon.cli.daemon_cmd:restart",
    "status": "openeidon.cli.daemon_cmd:status",
    "vault": "openeidon.cli.vault_cmd:vault",
    "add": "openeidon.cli.add_cmd:add",
    "operators": "openeidon.cli.operators_cmd:operators",
    "eval": "openeidon.cli.eval_cmd:eval_group",
    "host": "openeidon.cli.host_cmd:host",
    "quickstart": "openeidon.cli.quickstart_cmd:quickstart",
    "optimize": "openeidon.cli.optimize_cmd:optimize_group",
    "feedback": "openeidon.cli.feedback_cmd:feedback_group",
    "compose": "openeidon.cli.compose_cmd:compose",
    "gateway": "openeidon.cli.gateway_cmd:gateway",
    "tool": "openeidon.cli.tool_cmd:tool",
    "registry": "openeidon.cli.registry_cmd:registry",
    "config": "openeidon.cli.config_cmd:config",
    "scan": "openeidon.cli.scan_cmd:scan",
    "connect": "openeidon.cli.connect_cmd:connect",
    "digest": "openeidon.cli.digest_cmd:digest",
    "deep-research-setup": "openeidon.cli.deep_research_setup_cmd:deep_research_setup",
    "research": "openeidon.cli.deep_research_setup_cmd:deep_research_setup",
    # Gateway commands whose deps (starlette, …) may be uninstalled
    "auth": "openeidon.cli.auth_cmd:auth",
    "tunnel": "openeidon.cli.tunnel_cmd:tunnel",
}

#: commands silently hidden when their optional dependencies are missing
_OPTIONAL_COMMANDS = {"auth", "tunnel"}


class _LazyGroup(click.Group):
    def list_commands(self, ctx: click.Context) -> list[str]:
        return sorted(set(super().list_commands(ctx)) | set(_LAZY_COMMANDS))

    def get_command(self, ctx: click.Context, name: str):
        target = _LAZY_COMMANDS.get(name)
        if target is None:
            return super().get_command(ctx, name)
        module_name, attr = target.split(":")
        try:
            module = importlib.import_module(module_name)
        except ImportError:
            if name in _OPTIONAL_COMMANDS:
                return None
            raise
        return getattr(module, attr)


@click.group(cls=_LazyGroup, help="OpenEidon — modular AI assistant backend")
@click.version_option(version=openeidon.__version__, prog_name="eidon")
@click.option("--verbose", is_flag=True, default=False, help="Enable debug logging")
@click.option("--quiet", is_flag=True, default=False, help="Suppress non-error output")
@click.pass_context
def cli(ctx: click.Context, verbose: bool, quiet: bool) -> None:
    """Top-level CLI group."""
    from openeidon.cli.log_config import setup_logging

    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose
    ctx.obj["quiet"] = quiet
    setup_logging(verbose=verbose, quiet=quiet)

    # Check for updates on interactive commands
    if not quiet and ctx.invoked_subcommand:
        from openeidon.cli._version_check import check_for_updates

        check_for_updates(ctx.invoked_subcommand)


def main() -> None:
    """Entry point registered as ``eidon`` console script."""
    cli()


__all__ = ["cli", "main"]
