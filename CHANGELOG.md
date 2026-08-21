# Changelog

All notable changes to OpenEidon are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Routing and latency

Measured on a GTX 1650 (4 GB) with a locally installed Qwen3 model, routing
the same set of requests: **9/14 correct at 4578 ms before, 14/14 at 835 ms
after**.

#### Changed

- The request router now uses **native tool calling** instead of asking the
  model to write a JSON plan inside its reply. The JSON approach could fail
  in a way tool calling cannot — one installed model returned prose the
  parser could not read at 14/14 unparseable. The prompt path remains as a
  fallback for models that do not emit tool calls reliably.
- Tool definitions moved to `frontend/src/lib/routing-tools.json` so the
  frontend and the routing eval read the same source.
- `show_message` is no longer offered to the model: the executor only logs
  it, so choosing it produced nothing the user could see.
- Ollama `keep_alive` is now set (30m by default, `EIDON_KEEP_ALIVE`
  overrides). Ollama's own 5-minute default meant an assistant used in
  bursts paid a ~10 s model load on most interactions.
- `num_ctx` is sized from detected VRAM instead of a fixed 8192, which on a
  4 GB card pushed models onto the CPU: 16009 ms against 1031 ms for the
  same call.

#### Fixed

- The chat endpoint ignored the `tools` parameter whenever an agent was
  configured, so a client asking the model to route a command received a
  plain refusal instead of a tool call.
- `max_tokens` was advisory: a complexity heuristic raised it and the agent
  path ignored it entirely. An explicit value is now a hard cap.
- Five handlers rewrote deliberate HTTPExceptions into a generic
  "Internal server error", making a missing search result and a real crash
  look identical.
- `open_site` rejected the domain people actually say ("youtube"), so
  "открой ютуб" errored. Targets are normalised server-side; a bare word
  becomes a search rather than a guessed domain, and the scheme check that
  blocks `file://` and UNC paths still runs first.
- "запомни ..." wrote only to a preferences file nothing displays, so the
  MEMORY sidebar never changed.
- `cancel_reminder` was offered to the model with no endpoint and no
  executor behind it. Both added.
- Model sizes travel to the UI: three engine wrappers dropped the metadata.

#### Added

- Model weight is shown wherever a model is chosen, and the top-bar model
  chip is a working picker.
- OpenCode sessions take their own model, defaulting to the lightest one
  installed.
- `tests/intelligence/test_routing_live.py` scores the router over 27
  phrases; schema checks run everywhere, accuracy needs a live model.

---

## [0.2.0] — 2026-08-21

First OpenEidon release.

#### Added

- **OpenCode integration** — AGENT mode delegates coding tasks to a headless
  `opencode serve` instance. `connectors/opencode.py` (process + session API),
  `tools/code_agent.py` (registry tool), `server/code_routes.py` (`/v1/code/*`).
  Project directories are checked against the file-roots allowlist and
  permission requests are surfaced to the user, never auto-approved.
  See `docs/architecture/opencode.md`.
- `CLAUDE.md` and `scripts/dev-setup.ps1` for reproducible environment setup.

#### Changed

- **Rebranded to OpenEidon**: package `openeidon`, CLI `eidon`, config dir
  `~/.openeidon`, env vars `OPENEIDON_*`, Tauri id `com.openeidon.desktop`.
  Attribution to OpenJarvis retained in NOTICE and README.
- **FOX is the only UI**: `EidonApp` renders by default (previously behind
  `?eidon=1`). The legacy router pages, Layout, CommandPalette, OptInModal and
  24 orphaned modules were removed; `desktop-mini` (Electron) deleted.
- **Repository flattened** — code moved from `OpenJarvis-main/` to the root,
  which also activated the GitHub Actions workflows.

- **Piper TTS** — local neural speech synthesis registered as the `piper`
  backend, with Russian voices by default (`speech-piper` extra).
- **Structured memory** — `openeidon.memory` stores people, projects, and
  preferences in SQLite; exposed as the `memory_facts` tool for agents, as
  `/v1/memory/facts`, and as the now-functional MEMORY sidebar section.
- **Server-side workflows** — `/v1/workflows` persists workflows as scheduler
  tasks, so a workflow scheduled for 09:00 fires without a browser tab open.
  The UI syncs through to it and keeps localStorage as an offline mirror.
- **Intent classification** moved into `openeidon.intelligence.intent`: a
  deterministic rule pass handles volume/brightness/screen commands and
  question openers without a model call; the model handles only ambiguous
  cases. Failures now log instead of vanishing into a bare except.

#### Performance

- CLI cold start 715 ms → 160 ms (lazy SDK import + Click LazyGroup).
- Frontend entry bundle 630 kB → 359 kB (gzip 190 → 108 kB) by lazy-loading
  the markdown/katex renderer; dropped unused `recharts` and `react-router`.

#### Fixed

- `server/routes.py` referenced an undefined `logger`, raising `NameError` on
  every error path instead of returning the intended 500.
- `src/openeidon/traces` was excluded from the repository by an overbroad
  `traces/` ignore rule, breaking 25 test modules at collection.
- Hardcoded `D:\projects\eidon` file-roots path replaced with
  `~/.openeidon/file-roots.json`.
- Removed the hardcoded `qwen3.5:cloud` fallback model from three server
  helpers — a cloud model on a local-first product; they now use the
  configured default and then the server's own model.

#### Release

- Versions unified at 0.2.0 across the Python package, frontend, desktop
  shell, and Tauri bundle.
- Desktop installers are now built only for `desktop-v*` tags and manual
  runs instead of on every push touching the frontend.

---

### Added

#### Skills System (Plans 1, 2A, 2B)

- **Skills core** — every skill is a tool. Skills appear in a system prompt catalog, agents invoke them on demand, content (pipeline results, markdown instructions, or both) gets injected into context.
  - `SkillManifest` + `SkillStep` types with tags, depends, invocation flags, markdown content
  - `SkillManager` — discovery, precedence resolution, catalog XML generation, tool wrapping
  - `SkillTool(BaseTool)` — auto-extracts parameters from step argument templates
  - `SkillExecutor` — sequential pipeline execution with sub-skill delegation
  - Dependency graph with cycle detection, max depth enforcement, capability unions
  - Security: four trust tiers (bundled/indexed/unreviewed/workspace), capability-gated enforcement
  - Skill index module for git-backed registry search

- **agentskills.io spec adoption** — canonical `SKILL.md` format with YAML frontmatter following the [agentskills.io](https://agentskills.io/specification) open standard.
  - `SkillParser` with strict spec validation + tolerant field mapping via `FIELD_MAPPING` table
  - `ToolTranslator` for external tool name translation (Bash -> shell_exec, Read -> file_read, etc.)
  - Source resolvers: `HermesResolver`, `OpenClawResolver`, `GitHubResolver`
  - `SkillImporter` with provenance tracking (`.source` metadata files), optional script import
  - Sourced subdirectory layout (`~/.openjarvis/skills/<source>/<name>/`)

- **Skills learning loop** — trace tagging, pattern discovery, DSPy/GEPA optimization.
  - Trace metadata tagging: `skill`, `skill_source`, `skill_kind` flow through ToolExecutor -> TraceCollector -> TraceStep
  - `SkillDiscovery` wired into `SkillManager.discover_from_traces()` with kebab name normalization
  - `SkillOptimizer` — per-skill DSPy/GEPA wrapper that buckets traces and writes sidecar overlays
  - `SkillOverlay` — sidecar storage at `~/.openjarvis/learning/skills/<name>/optimized.toml`
  - `SkillManager._load_overlays()` applies optimized descriptions + few-shot examples at discovery time
  - `LearningOrchestrator._maybe_optimize_skills()` — opt-in auto-trigger

- **Skills benchmark harness** — 4-condition PinchBench evaluation.
  - I3 fix: `skill_few_shot_examples` wired through SystemBuilder -> `_run_agent` -> `ToolUsingAgent` -> `native_react.REACT_SYSTEM_PROMPT`
  - `SkillBenchmarkRunner` — 4-condition x N-seed x M-task sweep with markdown report
  - `JarvisAgentBackend` accepts `skills_enabled` and `overlay_dir` kwargs
  - Conditions: `no_skills`, `skills_on`, `skills_optimized_dspy`, `skills_optimized_gepa`

- **CLI commands:**
  - `jarvis skill list` / `info` / `run` / `install` / `sync` / `sources` / `update` / `remove` / `search`
  - `jarvis skill discover` — mine traces for recurring tool patterns
  - `jarvis skill show-overlay` — inspect optimization output
  - `jarvis optimize skills` — run DSPy/GEPA per-skill optimization
  - `jarvis bench skills` — run the PinchBench skills benchmark

- **Agent prompt improvement:**
  - `native_react.REACT_SYSTEM_PROMPT` now includes "Using Skills" guidance that teaches agents to distinguish executable vs. instructional skill responses
  - `{skill_examples}` placeholder for optimized few-shot example injection

- **Configuration:**
  - `[skills]` section: `enabled`, `skills_dir`, `active`, `auto_discover`, `auto_sync`, `max_depth`, `sandbox_dangerous`
  - `[[skills.sources]]` section: `source`, `url`, `filter`, `auto_update`
  - `[learning.skills]` section: `auto_optimize`, `optimizer`, `min_traces_per_skill`, `optimization_interval_seconds`, `overlay_dir`
  - `SkillSourceConfig` and `SkillsLearningConfig` dataclasses

- **Documentation:**
  - `docs/user-guide/skills.md` — comprehensive user guide
  - `docs/architecture/skills.md` — technical deep-dive
  - `docs/tutorials/skills-workflow.md` — end-to-end tutorial
  - `docs/getting-started/configuration.md` — expanded with skills config sections
  - `CLAUDE.md` — updated architecture section

### Fixed

- **Trace metadata flow** — `ToolResult.metadata` now propagates through `TOOL_CALL_END` event to `TraceStep.metadata` (was silently dropped at the event-bus boundary)
- **TaintSet JSON serialization** — `ToolExecutor._json_safe_metadata()` filters non-JSON-serializable values (like `TaintSet`) from event payloads before they reach `TraceStore`
- **Non-dict YAML frontmatter** — source resolvers handle `yaml.safe_load()` returning a string instead of a dict (discovered on real OpenClaw imports)
- **OpenClaw category/name queries** — `jarvis skill install openclaw:owner/slug` now correctly splits into category + name match
- **SkillDiscovery trace compatibility** — `_extract_tool_sequence` reads from `step.input["tool"]` (the actual `TraceStep` format), not the nonexistent `step.tool_name` attribute
- **LearningOrchestrator skill trigger** — `_maybe_optimize_skills` runs BEFORE the SFT-data short-circuit (skills are tagged via trace metadata, not mined as SFT pairs)
- **PinchBenchScorer constructor** — `SkillBenchmarkRunner` constructs `PinchBenchScorer(judge_backend, model)` instead of no-args
- **EvalRunner results access** — reads per-task data from `eval_runner.results` property, not nonexistent `summary.results`
