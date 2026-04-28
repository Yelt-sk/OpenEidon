# Деплой OpenJarvis на Windows с Ollama Cloud по умолчанию

## Кратко

Первый этап: поднять локальный backend и browser UI из `D:\projects\Jarvis\OpenJarvis-main`, использовать `qwen3.5:cloud` как модель по умолчанию через локальный Ollama host, держать локальный fallback на уже скачанные модели и сразу включить локальный STT через `faster-whisper`.

Русский TTS в первый этап не входит. Если понадобится локальный TTS на русском, отдельным этапом добавить `Piper`.

## Решения

- Основной inference path: `Ollama` -> `qwen3.5:cloud`
- Fallback 1: `gemma4:e2b`
- Fallback 2: `qwen2.5:3b`
- Интерфейс первого этапа: browser UI
- Desktop app: позже, отдельным этапом
- Речь первого этапа: только STT, локально через `faster-whisper`
- TTS: не включать, `kokoro` не считать целевым решением для русского

## Что нужно сделать

1. Системно установить `uv` и `Rust stable (msvc)`.
2. В проекте создать и наполнить локальное Python-окружение через `uv`.
3. Собрать Rust extension через `maturin`.
4. Установить frontend-зависимости только в `frontend/node_modules`.
5. Проверить доступность `Ollama` и `qwen3.5:cloud`.
6. Сгенерировать конфиг через `jarvis init`.
7. Привести конфиг к виду:
   - `[engine].default = "ollama"`
   - `[engine.ollama].host = "http://127.0.0.1:11434"`
   - `[intelligence].default_model = "qwen3.5:cloud"`
   - `[intelligence].fallback_model = "gemma4:e2b"`
   - `[server].host = "127.0.0.1"`
   - `[server].port = 8000`
   - `[tools.storage].default_backend = "sqlite"`
   - speech backend: `faster-whisper`, модель `base` или `small`, CPU
8. Поднять сервисы:
   - `Ollama`
   - `jarvis serve` на `127.0.0.1:8000`
   - `frontend` dev server на `127.0.0.1:5173`
9. Прогнать smoke-тесты backend, frontend и speech.

## Проверки

- `python`, `node`, `git`, `uv`, `rustc` доступны
- `http://127.0.0.1:11434/api/tags` отвечает
- `qwen3.5:cloud` и локальные fallback-модели видны в `tags`
- `uv sync --extra server` проходит
- `uv run maturin develop -m rust/crates/openjarvis-python/Cargo.toml` проходит
- `uv run jarvis serve --host 127.0.0.1 --port 8000 --engine ollama --model qwen3.5:cloud` стартует
- `/health` возвращает `200`
- `/v1/models` возвращает список моделей
- `frontend/npm install` и `npm run dev` проходят
- UI открывается на `http://localhost:5173`
- speech health показывает локальный `faster-whisper`

## Комментарий по платным решениям

Если не использовать платные внешние сервисы, основная потеря будет в качестве на сложных задачах и в облачном STT/TTS. В текущей схеме это частично компенсируется тем, что основной путь идет через `qwen3.5:cloud` в Ollama.
