# OpenEidon

Local-first AI assistant platform. Fork of OpenJarvis (Apache 2.0, see NOTICE);
fully rebranded: package `openeidon`, CLI `eidon`, config dir `~/.openeidon`.

## Layout

- `src/openeidon/` — Python backend: agents, engine (inference backends), tools,
  connectors, channels, server (FastAPI), learning, evals, mcp, traces
- `frontend/` — web UI (React + Vite + Tailwind). Single interface: FOX
  (`src/pages/EidonApp.tsx`), rendered by default; `?overlay=1` shows the mini
  overlay. Build output goes to `src/openeidon/server/static/` (gitignored).
- `desktop/` — Tauri shell that wraps `frontend/` (no own UI code)
- `rust/` — PyO3 native extension (`openeidon_rust`), optional at runtime;
  Python side accesses it only via `src/openeidon/_rust_bridge.py`
- `configs/openeidon/` — config presets and persona prompts
- `tests/` — pytest suite (~5700 tests)

## Commands

```bash
uv sync --extra dev              # install backend deps
uv run pytest -q                 # run tests (Rust extension optional; its tests skip)
uv run ruff check src tests      # lint
uv run eidon --help              # CLI
npm --prefix frontend run build  # frontend build (tsc + vite)
uv run maturin develop -m rust/crates/openeidon-python/Cargo.toml  # native ext (needs Rust)
```

On Windows some tests fail for platform reasons (shell_exec, path handling,
SQLite FTS5) — compare against the known-failure count before blaming a change.

## Conventions

- New components (engines, tools, agents, channels) register via the
  registries in `src/openeidon/core/registry.py`; lifecycle events go through
  `EventBus` (`src/openeidon/core/events.py`).
- Keep heavy imports lazy: modules must not pull optional deps (telegram,
  datasets, openai) at import time.
- Runtime user data lives in `~/.openeidon/` — never write it into the repo.
- `.gitignore` runtime-output rules are anchored to repo root (`/traces/`,
  `/logs/`, `/results/`); do not add bare directory patterns that could
  swallow source packages (this once silently dropped `src/openeidon/traces`).
- Attribution to OpenJarvis stays in NOTICE and README; do not rebrand those
  mentions.
