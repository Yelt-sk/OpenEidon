"""Command-line interface for OpenEidon (Click-based)."""

from __future__ import annotations

import click

import openeidon
from openeidon.cli.add_cmd import add
from openeidon.cli.agent_cmd import agent
from openeidon.cli.ask import ask
from openeidon.cli.bench_cmd import bench
from openeidon.cli.channel_cmd import channel
from openeidon.cli.channels_cmd import channels
from openeidon.cli.chat_cmd import chat
from openeidon.cli.compose_cmd import compose
from openeidon.cli.config_cmd import config
from openeidon.cli.connect_cmd import connect
from openeidon.cli.daemon_cmd import restart, start, status, stop
from openeidon.cli.deep_research_setup_cmd import deep_research_setup
from openeidon.cli.digest_cmd import digest
from openeidon.cli.doctor_cmd import doctor
from openeidon.cli.eval_cmd import eval_group
from openeidon.cli.feedback_cmd import feedback_group
from openeidon.cli.gateway_cmd import gateway
from openeidon.cli.host_cmd import host
from openeidon.cli.init_cmd import init
from openeidon.cli.memory_cmd import memory
from openeidon.cli.model import model
from openeidon.cli.operators_cmd import operators
from openeidon.cli.optimize_cmd import optimize_group
from openeidon.cli.quickstart_cmd import quickstart
from openeidon.cli.registry_cmd import registry
from openeidon.cli.scan_cmd import scan
from openeidon.cli.scheduler_cmd import scheduler
from openeidon.cli.serve import serve
from openeidon.cli.skill_cmd import skill
from openeidon.cli.telemetry_cmd import telemetry
from openeidon.cli.tool_cmd import tool
from openeidon.cli.vault_cmd import vault
from openeidon.cli.workflow_cmd import workflow


@click.group(help="OpenEidon — modular AI assistant backend")
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


cli.add_command(init, "init")
cli.add_command(ask, "ask")
cli.add_command(chat, "chat")
cli.add_command(serve, "serve")
cli.add_command(model, "model")
cli.add_command(memory, "memory")
cli.add_command(telemetry, "telemetry")
cli.add_command(bench, "bench")
cli.add_command(channel, "channel")
cli.add_command(channels, "channels")
cli.add_command(scheduler, "scheduler")
cli.add_command(doctor, "doctor")
cli.add_command(agent, "agents")
cli.add_command(workflow, "workflow")
cli.add_command(skill, "skill")
cli.add_command(start, "start")
cli.add_command(stop, "stop")
cli.add_command(restart, "restart")
cli.add_command(status, "status")
cli.add_command(vault, "vault")
cli.add_command(add, "add")
cli.add_command(operators, "operators")
cli.add_command(eval_group, "eval")
cli.add_command(host, "host")
cli.add_command(quickstart, "quickstart")
cli.add_command(optimize_group, "optimize")
cli.add_command(feedback_group, "feedback")
cli.add_command(compose, "compose")
cli.add_command(gateway, "gateway")
cli.add_command(tool, "tool")
cli.add_command(registry, "registry")
cli.add_command(config, "config")
cli.add_command(scan, "scan")
cli.add_command(connect, "connect")
cli.add_command(digest, "digest")
cli.add_command(deep_research_setup, "deep-research-setup")
cli.add_command(deep_research_setup, "research")

# Gateway CLI commands (lazy import to avoid pulling starlette)
try:
    from openeidon.cli.auth_cmd import auth

    cli.add_command(auth, "auth")
except ImportError:
    pass

try:
    from openeidon.cli.tunnel_cmd import tunnel

    cli.add_command(tunnel, "tunnel")
except ImportError:
    pass


def main() -> None:
    """Entry point registered as ``eidon`` console script."""
    cli()


__all__ = ["cli", "main"]
