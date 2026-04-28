# Работа за 18 апреля 2025

## Анализ инструментов (tools.md)

Проведён полный аудит intent routing и backend tools. Выявлены сценарии сбоев:
- Конфликты между детекторами ("включи spotify" → YouTube вместо приложения)
- Семантически неоднозначные команды без контекста ("включи тихо" → YouTube)
- Ложный success агента (пишет "Opened X" без вызова инструментов)
- Playwright-браузер headless — пользователь не видит действий
- `/v1/system/open-app` всегда возвращает `ok: True`

---

## Реализованные улучшения

### 1. LLM-классификатор intent (`/v1/intent/classify`)
- Новый backend endpoint в `routes.py`
- Принимает запрос, возвращает `{category, subject}`: `app | media | system_cmd | chat`
- Temperature=0, max_tokens=40 — быстрый (~150-250ms)
- Реиспользует паттерн `engine.generate()` как `_choose_apps_with_model`

### 2. Умный роутинг "включи X"
- Новый детектор `isAmbiguousPlaybackIntent` — ловит "включи/play/start/put on"
- При срабатывании вызывает классификатор:
  - `app` → `openLocalApp()`
  - `system_cmd` → агент (shell_exec для громкости)
  - `media/chat/ошибка` → `playYouTubeQuery()` (дефолт)
- Чёткие паттерны (открой сайт, запусти) остались на regex

### 3. Fast-path создания проектов
- Детектор `isCreateProjectIntent` для "создай сайт/проект/приложение"
- Вызывает `/v1/projects/generate` напрямую, минуя агента
- Реально создаёт файлы через LLM + `os.startfile` — без ложного success

### 4. Обновлён AGENT_PROMPT
- Запрет писать "Opened/Done/Launched" без вызова инструмента
- Приоритет `shell_exec` над browser tools (browser — headless)
- Явное указание PowerShell для системных команд (громкость, яркость)

### 5. Live индикатор текущего инструмента
- Под "Ollama Qwen 3.5:cloud" в UI теперь показывается зелёным активный tool
- Парсятся SSE события: `event: tool_result` → имя tool, `tool_progress` → читаемый лейбл
- Сбрасывается в название модели после завершения

### 6. Смягчён ложный success open-app
- `openLocalApp` больше не пишет "Opened X" если LLM не нашёл совпадение в Start Menu
- Возвращает нейтральный "Пытаюсь открыть: X"

---

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `desktop-mini/src/lib/intent.ts` | Классификатор, новые детекторы, live tool callback, обновлён AGENT_PROMPT |
| `desktop-mini/src/index.tsx` | State `currentTool`, отображение в UI |
| `src/openjarvis/server/routes.py` | Endpoint `/v1/intent/classify`, модель `IntentClassifyRequest` |
