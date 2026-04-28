<div align="center">
  <img alt="OpenEidon" src="assets/openEidon_header_for_readme_and_ad.png" width="420">

  <h1>OpenEidon</h1>
  <p><strong>Local-first AI assistant platform for practical personal workflows.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License">
    <img src="https://img.shields.io/badge/python-3.10%2B-blue" alt="Python">
    <img src="https://img.shields.io/badge/platform-desktop%20%7C%20web%20%7C%20cli-black" alt="Platforms">
    <img src="https://img.shields.io/badge/focus-local--first-orange" alt="Local-first">
  </p>

  <p>
    <a href="#quick-start"><strong>Quick Start</strong></a>
    &nbsp;&nbsp;�&nbsp;&nbsp;
    <a href="#why-openeidon"><strong>Why OpenEidon</strong></a>
  </p>
</div>

---

OpenEidon is a product-focused AI platform built on top of OpenJarvis. It keeps the local-first foundation, composable backend, and agent infrastructure, then pushes the experience toward something easier to use, easier to package, and easier to present as a real personal AI product.

## Why OpenEidon

Most AI assistants are still thin shells around cloud APIs. OpenEidon is aimed at a different model: your assistant should run close to you, use local inference when possible, expose clean desktop and web surfaces, and remain extensible when you need more than chat.

OpenEidon is designed for teams and makers who want:

- a local-first assistant platform instead of a single hosted chatbot
- desktop, web, and CLI entry points in one repo
- composable backend primitives for agents, tools, memory, and inference
- practical personal AI workflows such as research, automation, monitoring, and code assistance
- an open Apache 2.0 base that can be distributed, adapted, and extended

## What You Can Do With It

- Run a personal AI assistant on your own machine
- Connect local or cloud inference backends behind one interface
- Build workflow-driven assistants for research, coding, monitoring, and daily briefings
- Ship desktop and browser experiences on top of the same backend
- Extend the system with tools, skills, memory backends, and custom agents

## Screenshots

### Current Interface Preview

![OpenEidon interface preview](screenshot.png)

_Main product screenshot from the current repository state._

![OpenEidon web/home preview](youtube_homepage.png)

_Alternative preview that can be replaced later with a cleaner landing or app screenshot._

### Planned Gallery Slots

Replace these with your final marketing visuals when ready:

- `docs/assets/openeidon-hero.png` - main hero screenshot for the README first screen
- `docs/assets/openeidon-chat.png` - core assistant/chat UI
- `docs/assets/openeidon-workflow.png` - workflow or automation screen
- `docs/assets/openeidon-desktop.png` - desktop app window or system integration view

## Quick Start

### Prerequisites

- Python 3.10+
- `uv`
- Git
- Rust for the bundled native extension
- A local inference backend such as Ollama, vLLM, SGLang, or `llama.cpp`

### Setup

```bash
git clone https://github.com/open-jarvis/OpenJarvis.git
cd OpenJarvis
uv sync
uv sync --extra server
uv run maturin develop -m rust/crates/openjarvis-python/Cargo.toml
```

If you use Python 3.14+, set `PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1` before the `maturin` step.

### First Run

```bash
uv run jarvis init
ollama serve
ollama pull qwen3:8b
uv run jarvis ask "What is the capital of France?"
```

Useful follow-ups:

```bash
uv run jarvis doctor
uv run jarvis serve --port 8000
uv run jarvis chat
```

## Key Capabilities

### Multi-Surface Product Base

- desktop application layer
- web frontend
- CLI for development and automation
- Python SDK and FastAPI server underneath

### Local-First Intelligence

- hardware-aware setup flow
- pluggable inference engines
- local-by-default architecture with optional cloud fallback
- support for practical on-device assistant workflows

### Agentic and Workflow-Oriented

- built-in agents for orchestration, research, monitoring, and chat
- tools, memory, and skills as composable building blocks
- suitable base for productized AI assistants rather than isolated demos

### Developer-Friendly Core

- modular Python package structure
- optional extras for server, memory, browser, channels, speech, and more
- room to evolve both the UX layer and the backend independently

## Architecture & Stack

OpenEidon inherits a substantial part of its technical base from OpenJarvis and layers a more product-oriented direction on top.

Core stack in this repository:

- `src/openjarvis/` - backend package, agents, engines, tools, learning, memory
- `frontend/` - web UI
- `desktop/` and `desktop-mini/` - desktop application surfaces
- `rust/` - native extension and performance-critical components
- `configs/` - presets and configuration assets
- `docs/` - project documentation and architecture notes

At a high level, the platform combines:

- inference backends
- agent logic
- tools and skills
- memory and storage
- API and UI layers

## How OpenEidon Differs from OpenJarvis

OpenEidon is built on OpenJarvis, but it is not presented as a simple rename.

OpenJarvis is primarily framed as a research-driven, local-first AI framework. OpenEidon takes that technical foundation and positions it as a product platform: more emphasis on UX, packaging, presentation, and end-user workflows; less emphasis on research branding as the main story.

In practice, that means OpenEidon is intended to feel closer to a distributable personal AI product, while still benefiting from the composable architecture, local-first runtime model, and open ecosystem inherited from OpenJarvis.

## Project Structure

```text
.
|-- src/            Python backend and core assistant logic
|-- frontend/       Web client
|-- desktop/        Desktop application
|-- desktop-mini/   Lightweight desktop surface
|-- configs/        Presets and configuration files
|-- docs/           Documentation and assets
|-- tests/          Test suite
```

## License

OpenEidon is distributed under the Apache License 2.0.

See [LICENSE](LICENSE) for the full text.

## Attribution

This project is based on OpenJarvis and keeps that lineage explicit. The goal of OpenEidon is to build a distinct product experience on top of that open technical base, not to erase where it came from.
