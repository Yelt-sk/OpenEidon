# Command Log

## Toolchain and environment

- `python --version`
- `node --version`
- `git --version`
- `ollama --version`
- `Invoke-WebRequest http://127.0.0.1:11434/api/tags`

## Setup

- `uv python install 3.11`
- `uv sync --python .\\.uv-python\\cpython-3.11.15-windows-x86_64-none\\python.exe --extra server --extra speech --extra dev`
- `python -m maturin develop --uv -m rust\\crates\\openjarvis-python\\Cargo.toml`
- `npm install`
- `python -m openjarvis.cli init --force --full --engine ollama --no-download --no-scan`

## Runtime checks

- `GET http://127.0.0.1:8000/health`
- `GET http://127.0.0.1:8000/v1/models`
- `GET http://127.0.0.1:8000/v1/speech/health`
- `POST http://127.0.0.1:8000/v1/chat/completions` with `qwen3.5:cloud`
- `POST http://127.0.0.1:8000/v1/chat/completions` with `gemma4:e2b`
- `GET http://127.0.0.1:5173/`
- `GET http://127.0.0.1:5173/v1/models`
- `POST http://127.0.0.1:5173/v1/chat/completions`
- `POST http://127.0.0.1:8000/v1/speech/transcribe`
- `POST http://127.0.0.1:5173/v1/speech/transcribe`

## Notes

- Backend is currently launched in a minimized `cmd.exe` window to avoid Windows console-close termination.
- Russian STT smoke-test audio file: `.run-logs/ru-smoke.wav`
