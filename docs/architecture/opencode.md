# OpenCode integration

OpenEidon delegates multi-step coding work to [OpenCode](https://opencode.ai)
instead of growing its own coding agent. Eidon stays the orchestrator: it owns
the conversation, memory, and connectors; OpenCode owns editing files, running
commands, and iterating on a codebase.

## Transport choice

OpenCode offers two integration channels:

| Channel | Shape | Verdict |
| --- | --- | --- |
| `opencode run "<task>"` | one-shot subprocess | no session reuse, no progress, no permission handling |
| `opencode serve` | headless HTTP server | sessions, streaming progress, diffs, permission prompts |

We use `opencode serve`. The server is started on demand on a free localhost
port and shut down with the process.

## Components

```
frontend (AGENT mode)
   │  POST /v1/code/task, GET /v1/code/sessions/{id}
   ▼
server/code_routes.py ──► connectors/opencode.py ──► opencode serve (HTTP)
   ▲                            ▲
   │                            │
tools/code_agent.py ────────────┘   (registry tool for orchestrator agents)
```

- **`connectors/opencode.py`** — `OpenCodeManager` owns the subprocess
  (`shutil.which` resolution so the Windows `opencode.cmd` shim works) and
  wraps the session API: `create_session`, `prompt`, `messages`, `diff`,
  `abort`, `respond_permission`.
- **`tools/code_agent.py`** — registry tool `code_agent`, so any orchestrator
  agent can hand off a task. Blocking call; returns the reply plus changed
  files. Declares `requires_confirmation=True`.
- **`server/code_routes.py`** — `/v1/code/*` for the UI. Runs tasks
  asynchronously and exposes a poll endpoint for progress.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/code/health` | is opencode installed / running |
| POST | `/v1/code/task` | start a task, returns `session_id` |
| GET | `/v1/code/sessions/{id}` | status, reply, tool activity, permissions, diff |
| POST | `/v1/code/permission` | answer a permission request (`once`/`always`/`reject`) |
| POST | `/v1/code/sessions/{id}/abort` | cancel a running task |

## Security

- Every task names a project directory, which must resolve **under the
  configured file roots** (`~/.openeidon/file-roots.json`, managed through
  `/v1/tools/file-roots`). Anything else is rejected with 403.
- OpenCode permission requests are **never auto-approved**: they surface in
  the poll response and the UI asks the user before answering.
- The server binds to `127.0.0.1` only.

## Setup

```bash
npm install -g opencode-ai
```

Nothing else is required — the bridge starts and stops the server itself. When
the binary is missing, `/v1/code/health` reports `installed: false` and the
AGENT mode reports it instead of failing silently.

## Not yet done

- MCP cross-wiring: OpenCode speaks MCP and Eidon ships an MCP server
  (`src/openeidon/mcp/`), so OpenCode could be given Eidon's memory and
  connectors as tools. Planned as a second step.
- Server-sent events: the bridge currently polls `/v1/code/sessions/{id}`
  every 2.5s. OpenCode exposes `GET /event` (SSE) which would replace polling
  with a push stream into the existing `EventBus` → WebSocket path.
