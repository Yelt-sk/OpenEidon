# Deploy Status

Date: 2026-04-12

## Completed

- Installed `uv`
- Installed `rustup` and Rust stable toolchain
- Installed MSVC Build Tools
- Created project-local Python runtime in `.uv-python`
- Created `.venv` and ran `uv sync --extra server --extra speech --extra dev`
- Built Rust extension with `maturin develop`
- Installed frontend dependencies in `frontend/node_modules`
- Generated `C:\Users\olivi\.openjarvis\config.toml`
- Set engine to `ollama`
- Set Ollama host to `http://127.0.0.1:11434`
- Set default model to `qwen3.5:cloud`
- Set fallback model to `gemma4:e2b`
- Set server host/port to `127.0.0.1:8000`
- Set storage backend to `sqlite`
- Enabled local STT with `faster-whisper` on CPU (`base`, `int8`)

## Runtime

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173`
- Ollama: `http://127.0.0.1:11434`

## Acceptance Checks

- `GET /health` -> `200`
- `GET /v1/models` -> models list returned
- `GET /v1/speech/health` -> `{"available":true,"backend":"faster-whisper"}`
- Chat via `qwen3.5:cloud` -> passed
- Chat via `gemma4:e2b` -> passed
- Frontend root on `5173` -> passed
- Frontend proxy `/v1/models` -> passed
- Frontend proxy `/v1/chat/completions` -> passed
- Speech transcription smoke-test via API -> passed

## Local Fix Applied

- Fixed Windows temp-file handling in `src/openjarvis/speech/faster_whisper.py`
- Reason: `NamedTemporaryFile` was reopened while still open, which caused `Permission denied` on Windows

## Tooling Status

- Fixed `/v1/tools` listing so browser/file/shell tools are exposed correctly to managed agents
- Added project-local Playwright browser resolution via `.playwright-browsers`
- Fixed browser session handling for threaded agent execution in `src/openjarvis/tools/browser.py`
- Disabled confirmation requirement for `shell_exec` so agents can actually use it
- Switched `shell_exec` to Windows PowerShell subprocess mode on Windows
- Added required Windows environment variables for `shell_exec`

## Current Limits

- Browser automation works
- File read/write and patch tools are available
- `shell_exec` now runs under PowerShell, but agent-generated PowerShell commands can still be poor and need tighter prompting
- Desktop-wide mouse/keyboard control for arbitrary Windows apps is not implemented in this codebase
