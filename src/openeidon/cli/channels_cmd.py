"""``eidon channels`` — manage messaging channels for the agent."""

from __future__ import annotations

import sys

import click
from rich.console import Console
from rich.table import Table


@click.group("channels")
def channels() -> None:
    """Manage messaging channels (iMessage/SMS via SendBlue, Slack)."""


@channels.command("status")
def channels_status() -> None:
    """Show status of all configured channels."""
    from openeidon.channels.imessage_daemon import is_running

    console = Console()
    table = Table(title="Channel Status")
    table.add_column("Channel", style="bold")
    table.add_column("Status")
    table.add_column("Details", style="dim")

    if is_running():
        table.add_row(
            "iMessage",
            "[green]running[/green]",
            "Polling chat.db",
        )
    else:
        table.add_row(
            "iMessage",
            "[dim]stopped[/dim]",
            "eidon channels imessage-start <contact>",
        )

    console.print(table)


@channels.command("imessage-start")
@click.argument("chat_identifier")
@click.option(
    "--background/--foreground",
    default=True,
    help="Run in background.",
)
def imessage_start(
    chat_identifier: str,
    background: bool,
) -> None:
    """Start the iMessage daemon for CHAT_IDENTIFIER.

    CHAT_IDENTIFIER is the phone number or email to monitor.
    """
    from openeidon.channels.imessage_daemon import (
        is_running,
        run_daemon,
    )

    console = Console()

    if is_running():
        console.print("[yellow]iMessage daemon already running.[/yellow]")
        return

    if background:
        import subprocess

        proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "openeidon.channels.imessage_daemon",
                "--chat",
                chat_identifier,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        console.print(
            f"[green]iMessage daemon started[/green] "
            f"(PID {proc.pid})\n"
            f"Monitoring: {chat_identifier}\n"
            "Text this contact from your iPhone "
            "to chat with the agent."
        )
    else:
        console.print(
            f"[green]Starting iMessage daemon[/green] — monitoring {chat_identifier}"
        )
        console.print("Press Ctrl+C to stop.\n")

        from openeidon.agents.deep_research import (
            DeepResearchAgent,
        )
        from openeidon.connectors.retriever import (
            TwoStageRetriever,
        )
        from openeidon.connectors.store import KnowledgeStore
        from openeidon.engine.ollama import OllamaEngine
        from openeidon.tools.knowledge_search import (
            KnowledgeSearchTool,
        )
        from openeidon.tools.knowledge_sql import (
            KnowledgeSQLTool,
        )
        from openeidon.tools.scan_chunks import ScanChunksTool
        from openeidon.tools.think import ThinkTool

        engine = OllamaEngine()
        store = KnowledgeStore()
        retriever = TwoStageRetriever(store)
        tools = [
            KnowledgeSearchTool(retriever=retriever),
            KnowledgeSQLTool(store=store),
            ScanChunksTool(
                store=store,
                engine=engine,
                model="qwen3.5:4b",
            ),
            ThinkTool(),
        ]
        agent = DeepResearchAgent(
            engine=engine,
            model="qwen3.5:4b",
            tools=tools,
        )

        def handler(text: str) -> str:
            result = agent.run(text)
            return result.content or "No results found."

        run_daemon(
            chat_identifier=chat_identifier,
            handler=handler,
        )


@channels.command("imessage-stop")
def imessage_stop() -> None:
    """Stop the iMessage daemon."""
    from openeidon.channels.imessage_daemon import stop_daemon

    console = Console()
    if stop_daemon():
        console.print("[green]iMessage daemon stopped.[/green]")
    else:
        console.print("[dim]iMessage daemon is not running.[/dim]")
