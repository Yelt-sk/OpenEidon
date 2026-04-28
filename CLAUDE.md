# CLAUDE.md — Jarvis Workspace

## Что это за проект

**Jarvis** — локальный AI-ассистент для Windows, работающий в браузере. Принимает голосовые и текстовые запросы, выполняет действия на ПК: открывает сайты/видео/приложения, управляет файлами, напоминаниями, заметками, запускает проекты.

Основан на фреймворке [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) (Stanford / Hazy Research).

---

## Стек

| Слой | Технология |
|------|-----------|
| Backend | Python 3.10+, FastAPI, OpenJarvis server |
| Frontend | React + TypeScript + Vite (`frontend/`) |
| Desktop overlay | Electron (`desktop-mini/`) — check-in попапы |
| Inference | Ollama → `qwen3.5:cloud` (primary), `gemma4:e2b`, `qwen2.5:3b` (fallbacks) |
| Speech | `faster-whisper` (STT, локально, CPU) |
| Build | `uv` (Python), `maturin` (Rust extension), `npm` (frontend) |

---

## Структура директорий

```
D:\projects\Jarvis\
├── OpenJarvis-main\                    # Основная кодовая база
│   ├── frontend\src\                   # React UI
│   │   ├── lib\api.ts                  # ★ Intent routing + все API функции
│   │   ├── components\Chat\
│   │   │   └── InputArea.tsx           # ★ submitText — порядок fast-path веток
│   │   ├── components\Workflow\
│   │   │   └── NewWorkflowModal.tsx    # Модал создания workflow
│   │   ├── pages\
│   │   │   ├── JarvisApp.tsx           # ★ Основной UI (?jarvis=1), SettingsPanel внутри
│   │   │   └── SettingsPage.tsx        # НЕ используется в ?jarvis=1 режиме
│   │   └── lib\store.ts               # Zustand state + Workflow тип
│   ├── src\openjarvis\
│   │   ├── server\routes.py           # ★ FastAPI backend routes
│   │   │   └── static\               # Собранный frontend (production)
│   │   ├── tools\
│   │   │   ├── browser.py
│   │   │   ├── reminder_tool.py
│   │   │   ├── notes_tool.py
│   │   │   ├── project_files_tool.py
│   │   │   ├── web_search.py
│   │   │   └── shell_exec.py
│   │   ├── reminders\manager.py
│   │   ├── speech\
│   │   └── cli\
│   ├── desktop-mini\                  # Electron overlay (check-in попапы)
│   │   ├── electron\main.cjs
│   │   ├── src\
│   │   │   ├── main.tsx
│   │   │   └── lib\
│   │   │       ├── checkin.ts
│   │   │       ├── api.ts
│   │   │       └── intent.ts
│   │   └── package.json
│   └── DEPLOY_PLAN.md
├── His-projects\                      # Проекты, создаваемые Jarvis
├── markdown\                          # Заметки пользователя (Markdown)
├── far_plan.md                        # Архитектурный план: screenshot+vision
├── .jarvis-reminders.json             # Данные напоминаний
├── .jarvis-checkin.json               # Настройки check-in (enabled, interval_minutes)
└── .jarvis-file-roots.json            # Кастомные директории для file tools (создаётся автоматически)
```

> **Важно про интерфейсы:** Пользователь использует `http://127.0.0.1:5173/?jarvis=1` — это `JarvisApp.tsx` со своим встроенным `SettingsPanel`. `SettingsPage.tsx` — другой маршрут, пользователь его не открывает. Все настройки добавлять в `JarvisApp.tsx`, а не в `SettingsPage.tsx`.

---

## Запуск

```bash
# 1. Убедиться что порт 8000 свободен (старый процесс зависает часто!)
# PowerShell (предпочтительно — taskkill в bash ломается):
$pid8000 = (netstat -ano | Select-String ":8000.*LISTENING" | ForEach-Object { ($_ -split '\s+')[-1] }) | Select-Object -First 1
Stop-Process -Id $pid8000 -Force

# 2. Backend (через PowerShell Start-Process для детача)
Start-Process -FilePath "uv" `
  -ArgumentList "run","jarvis","serve","--host","127.0.0.1","--port","8000","--engine","ollama","--model","qwen3.5:cloud" `
  -WorkingDirectory "D:\projects\jarvis\OpenJarvis-main" `
  -RedirectStandardOutput "D:\projects\jarvis\backend.log" `
  -RedirectStandardError "D:\projects\jarvis\backend_err.log" `
  -WindowStyle Hidden

# 3. Frontend dev
Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c","npx vite --host 127.0.0.1 --port 5173" `
  -WorkingDirectory "D:\projects\jarvis\OpenJarvis-main\frontend" `
  -RedirectStandardOutput "D:\projects\jarvis\frontend.log" `
  -RedirectStandardError "D:\projects\jarvis\frontend_err.log" `
  -WindowStyle Hidden

# 4. Production build (после любых изменений в frontend/src)
cd frontend && npm run build

# 5. Desktop overlay (Electron check-in)
cd desktop-mini && npm run desktop
```

> `npm run dev` без флага → `[::1]:5173` (IPv6) → Chrome не резолвит.  
> После `npm run build` статика в `src/openjarvis/server/static/` — production через backend.  
> **`taskkill /PID` в bash не работает** — использовать PowerShell `Stop-Process`.  
> **ENOSPC при запуске npm:** диск C: заполнен — очистить `%LOCALAPPDATA%\uv\cache` и `%LOCALAPPDATA%\npm-cache\content-v2`.

---

## Backend API endpoints

### Браузер/медиа
- `POST /v1/browser/play-youtube` — открыть YouTube видео (`{query}`)
- `POST /v1/browser/open-external` — открыть внешний URL (`{target}`)
- `POST /v1/browser/open-search-sites` — открыть поисковые сайты (`{query, limit}`)
- `POST /v1/browser/research-youtube` — research + open YouTube (`{query}`)

### Система
- `POST /v1/system/open-app` — запустить приложение по имени/запросу (LLM discovery)
- `POST /v1/system/open-app-direct` — запустить приложение по точному имени
- `GET /v1/system/apps` — список установленных приложений
- `GET /v1/system/processes` — список запущенных процессов

### Напоминания
- `POST /v1/reminders/set` — создать напоминание (`{text, delay_seconds?, due_at?}`)
- `GET /v1/reminders/alerts` — список активных напоминаний
- `POST /v1/reminders/ack` — подтвердить напоминание (`{reminder_id}`)

### File tools
- `POST /v1/tools/file-read` — прочитать файл (`{path, max_chars?}`)
- `POST /v1/tools/file-write` — записать файл (`{path, content, append?}`)
- `POST /v1/tools/file-list` — список файлов в директории (`{path}`)
- `POST /v1/tools/file-find-open` — найти файл по имени и открыть (`{query}`) — ищет по всем allowed roots, открывает через `os.startfile`
- `GET /v1/tools/file-roots` — получить список разрешённых директорий (`{roots, defaults, custom}`)
- `POST /v1/tools/file-roots` — сохранить кастомные директории (`{roots: string[]}`) → `.jarvis-file-roots.json`

### Check-in
- `GET /v1/checkin/settings` — получить настройки check-in
- `POST /v1/checkin/settings` — сохранить настройки check-in (`{enabled, interval_minutes}`)
  - Файл: `D:\projects\Jarvis\.jarvis-checkin.json`

### Прочее
- `GET /health` — healthcheck backend
- `GET /v1/models` — список моделей
- `POST /v1/projects/generate` — сгенерировать проект (`{prompt, model}`)
- `GET /v1/user/preferences` — пользовательские предпочтения
- `POST /v1/user/preferences/{category}` — сохранить предпочтения

---

## Intent Routing — ДЕТАЛЬНО

Вся логика маршрутизации в `submitText()` в `InputArea.tsx`.  
Детекторы-функции находятся в `api.ts`.

### Порядок веток (приоритет сверху вниз)

| # | Условие (функция из api.ts) | Действие | Backend endpoint |
|---|---------------------------|---------|-----------------|
| 1 | `isWorkAppsIntent(content)` | Открывает все saved work apps | `POST /v1/system/open-app` |
| 2 | `isOpenAppIntent(content)` | Открывает конкретное приложение | `POST /v1/system/open-app` |
| 3 | `isOpenMultipleSitesIntent(content)` | Открывает несколько сайтов | `POST /v1/browser/open-search-sites` |
| 4 | `isOpenSiteIntent(content)` | Открывает один сайт | `POST /v1/browser/open-external` |
| 5 | `isContextualPlaybackIntent(content)` | Включает видео из контекста ("включи одну из них") | `POST /v1/browser/play-youtube` |
| 6 | `isResearchThenVideoIntent(content)` | Research + открыть YouTube | `POST /v1/browser/research-youtube` |
| 6b | `isDirectPlaybackIntent(content)` | Прямой playback | `POST /v1/browser/play-youtube` |
| 7 | `isProjectCreateIntent(content)` | Генерирует проект | `POST /v1/projects/generate` |
| 8 | List apps fast-path (regex) | Показывает установленные приложения | `GET /v1/system/apps` |
| 9 | `buildAgentPlan(...)` | LLM планировщик → executeAction | Зависит от action.tool |
| 10 | Desktop agent fallback | `sendAgentMessage` → managed agent | `/v1/managed-agents/{id}/messages` |
| 11 | Raw chat stream | SSE streaming response | `/v1/chat/completions` |

> `isSavePreferenceIntent` удалён как fast-path — теперь обрабатывается через LLM tool `save_preference`.

### Ключевые детали детекторов

**`stripGreetingPrefix()`** — вызывается во всех детекторах. "привет, включи acdc" → "включи acdc".

**`isOpenAppIntent()`** — исключает: `музык/music/сайт/site/youtube/ютуб` + **файловые запросы**: `мою/мой/моё/мои/файл/докум/курсов/дипл/отчёт/презента/.docx/.pdf/.xlsx/.pptx`. Причина: документо-ориентированные запросы идут в `find_and_open_file`, а не в `open_app`.

**`isDirectPlaybackIntent()`** — исключает:
- `google/погугл/огугл/найди/find/search` → идут в research path
- `таймер/timer/напомни/remind/напоминан` → идут в LLM planner → `set_reminder`
- Срабатывает на: `^(включи|поставь|запусти|start|play|turn on|put on|launch)`

**`isContextualPlaybackIntent()`** — берёт bold-entities (`**Name**`) из последнего ответа ассистента.

**`researchThenOpenYouTube`** — если backend вернул 404 → fallback на `playYouTubeQuery`. Error detection: `/(404|405|Not Found|Method Not Allowed)/i`.

---

## LLM Планировщик (buildAgentPlan)

Файл: `api.ts`

**Сигнатура:**
```typescript
buildAgentPlan(
  userMessage: string,
  preferences: UserPreferences,
  model: string,
  installedApps: string[] = [],
  fileRoots: string[] = [],   // ← список доступных директорий для file tools
): Promise<AgentPlan | null>
```

**AgentAction type:**
```typescript
type AgentAction = {
  tool: 'open_app' | 'play_youtube' | 'open_site' | 'open_work_apps' | 'show_message'
      | 'list_installed_apps' | 'list_running_processes'
      | 'set_reminder' | 'list_reminders' | 'cancel_reminder'
      | 'web_search' | 'save_preference'
      | 'read_file' | 'write_file' | 'list_files' | 'find_and_open_file';
  name?: string;           // для open_app
  query?: string;          // для play_youtube, find_and_open_file
  url?: string;            // для open_site
  text?: string;           // для set_reminder, show_message
  delay_seconds?: number;  // для set_reminder (секунды от сейчас)
  due_at?: string;         // для set_reminder (ISO timestamp)
  reminder_id?: string;    // для cancel_reminder
  category?: string;       // для save_preference
  value?: string;          // для save_preference
  path?: string;           // для read_file, write_file, list_files
  file_content?: string;   // для write_file
}
```

**JARVIS_TOOLS_DESC** (все инструменты LLM):
```
open_app(name) — opens a desktop application by name
play_youtube(query) — plays music or video on YouTube
open_site(url) — opens a website URL in browser
open_work_apps() — opens all saved work applications
show_message(text) — shows a text message
list_installed_apps() — returns list of apps installed on the PC
list_running_processes() — returns list of currently running processes
set_reminder(text, delay_seconds) — set a timer/reminder
list_reminders() — list all active reminders/timers
cancel_reminder(reminder_id) — cancel a reminder by its id
web_search(query) — search the internet for real-time information
save_preference(category, value) — save a user fact to memory
read_file(path) — read the contents of a file on disk
write_file(path, file_content) — write or overwrite a file on disk
list_files(path) — list files and folders in a directory
find_and_open_file(query) — search for file by name across accessible dirs and open it
```

**Важные ALWAYS-правила в системном промпте:**
- `ALWAYS use list_installed_apps` when user asks what apps are installed
- `ALWAYS use list_running_processes` when user asks what is running
- `ALWAYS use set_reminder` when user asks for timer/reminder. Convert: 7 мин = 420, 1 час = 3600
- `ALWAYS use save_preference` when user says запомни/remember/запиши/сохрани
- `ALWAYS use web_search` for real-time data (новости, погода, цены, поищи в интернете)
- `ALWAYS use find_and_open_file` when user says "открой мою курсовую/диплом/отчёт" — без указания точного пути
- `ALWAYS use read_file` only when user wants to READ CONTENTS of a file with exact path
- `ALWAYS use list_files` when user asks what files are in a folder
- `ALWAYS use write_file` when user asks to save/create content to a file

**Контекст в системном промпте:**
- `appsHint` — список установленных приложений
- `fileRootsHint` — список доступных директорий (Desktop, Documents, D:\projects\jarvis + кастомные)

---

## File tools (доступ к файлам)

### Доступные директории (ALLOWED_ROOTS)

В `routes.py` — динамическая функция `get_file_roots()`:
- **По умолчанию:** `%USERPROFILE%\Desktop`, `%USERPROFILE%\Documents`, `D:\projects\jarvis`
- **Кастомные:** загружаются из `D:\projects\jarvis\.jarvis-file-roots.json`
- `_resolve_safe(path)` — проверяет, что путь под одним из allowed roots

### Настройки в UI

`FileAccessPanel` — компонент в `SettingsPanel` (`JarvisApp.tsx`):
- Показывает дефолтные директории (зелёные точки)
- Позволяет добавлять/удалять кастомные через поле ввода
- Сохраняет через `POST /v1/tools/file-roots`

### find_and_open_file — алгоритм

1. Разбивает `query` на слова, ищет в именах файлов (rglob по всем roots)
2. Если 1 совпадение → `os.startfile()` сразу
3. Если несколько → сортирует (меньше вложенность, короче имя), открывает лучший, сообщает об остальных
4. Если ничего → возвращает понятное сообщение

### API функции (api.ts)
```typescript
readFile(path, maxChars?)
writeFile(path, content, append?)
listFiles(path)
findAndOpenFile(query)
getFileRoots()      // GET /v1/tools/file-roots
setFileRoots(roots) // POST /v1/tools/file-roots
```

---

## Workflows

### Архитектура

- **Тип `Workflow`** (`store.ts`): `id, name, time (HH:MM), regularity, weekdays, tools, instructions, autonomy (1-4), lastRun, enabled`
- **Хранение:** localStorage (`openjarvis-workflows`), CRUD в Zustand store
- **Модал создания:** `NewWorkflowModal.tsx` — 6 полей: NAME, TIME, REGULARITY, TOOLS, INSTRUCTIONS, AUTONOMY
- **Scheduler** (`JarvisApp.tsx`): `setInterval(tick, 30_000)` — каждые 30с проверяет время, запускает через `buildAgentPlan`
- **Запуск:** `runWorkflow(wf)` → читает `useAppStore.getState().selectedModel` (избегает stale closure) → создаёт новый чат → выполняет план → `markWorkflowRan`

### Важно: stale closure в scheduler

`useEffect([], [])` захватывает state на момент mount. Внутри async callbacks **всегда** использовать `useAppStore.getState()` вместо деструктурированных переменных из хука.

---

## Напоминания (Reminders)

### Как работает end-to-end

1. Пользователь: "напомни через 7 минут достать чайник"
2. `isDirectPlaybackIntent` → `false` (исключение `напомни`)
3. `buildAgentPlan` → LLM: `{tool: "set_reminder", text: "достать чайник", delay_seconds: 420}`
4. `executeAction` case `set_reminder` → `POST /v1/reminders/set`
5. Ответ: "Напоминание установлено через 7 мин: **достать чайник**"

---

## Check-in система

- **Electron** (`desktop-mini/electron/main.cjs`): окно 340×245px, `alwaysOnTop`, frameless, bottom-right
- **Таймер**: каждые 60с проверяет `/v1/checkin/settings`. Если `enabled` и прошёл `interval_minutes` → показывает окно
- **React** (`desktop-mini/src/main.tsx`): `?checkin=1` → check-in режим
- **Логика** (`checkin.ts`): 2+ работы подряд → перерыв; 2+ idle подряд → активность; иначе → реакция + вопрос
- **Настройки:** `CheckInPanel` в `SettingsPanel` (`JarvisApp.tsx`) → `GET/POST /v1/checkin/settings`

---

## Desktop Agent (fallback)

Если ни одна fast-path ветка не сработала → `ensureDesktopChatAgent(model)` → `sendAgentMessage(...)`.

**Проекты** всегда в `D:\projects\Jarvis\His-projects`.

**`routeDesktopIntentFinal(content)`** — обогащает запрос инструкциями перед отправкой агенту.

---

## Пользовательские предпочтения (UserPreferences)

```typescript
interface UserPreferences {
  work_apps: string[];
  music: { genres: string[]; artists: string[] };
  frequent_apps: Record<string, number>;
  custom: Record<string, unknown>;
}
```

Хранятся на backend. `buildAgentPlan` получает preferences → вставляет в системный промпт. Сохранение через LLM tool `save_preference` (не fast-path).

---

## Известные проблемы и их статус

| Проблема | Статус | Root cause / Fix |
|----------|--------|-----------------|
| `огугли про медведей и открой видео` → "No web results found" | Исправлено | `apiJsonRequest` не включал HTTP статус → 404 не перехватывался |
| `включи музыку` → 242s текстовый отказ | Исправлено | Mojibake в `isDirectPlaybackIntent` regex |
| `включи acdc` → desktop_agent без действия | Исправлено | Mojibake + `stripGreetingPrefix` отсутствовал |
| `list_installed_apps` не вызывался | Исправлено | LLM уже имел apps в `appsHint` → fast-path до LLM |
| `поставь таймер` открывал YouTube | Исправлено | `^поставь` ловился `isDirectPlaybackIntent`, добавлено исключение |
| `открой мою курсовую` открывал Word/Excel | Исправлено | `isOpenAppIntent` перехватывал "открой". Добавлено исключение для "мою/мой/файл/курсов/..." + новый tool `find_and_open_file` |
| Workflow "no actions were planned" | Исправлено | Stale closure: `selectedModel` был `""` на mount. Фикс: `useAppStore.getState().selectedModel` |
| Кнопка удаления диалога исчезала при hover | Исправлено | Кнопка в DOM всегда, показ через `div:hover > .conv-del-btn` CSS |
| Desktop agent пишет ложный success | Частично | Зависит от модели |
| Desktop agent → Ollama 400 при tool-use | Открыта | `qwen3.5:cloud` иногда 400 для сложных agent-запросов. Fallback: `gemma4:e2b` |

---

## Тест-кейсы (минимальный набор после каждого фикса)

```
открой видео про медведей
огугли про медведей и открой видео про них
включи музыку
включи acdc
открой youtube
напомни через 7 минут достать чайник
поставь таймер на 2 минуты
какие приложения у меня установлены
открой мою курсовую                        ← file tools
покажи файлы на рабочем столе             ← file tools
запомни что я слушаю рок                  ← save_preference
поищи последние новости про ИИ            ← web_search
```

**Критерий успеха:** реально открылось окно/вкладка / появилось напоминание / файл открылся.  
Текст "Opened..." без реального действия — **не успех**.

---

## Правила работы

### Рабочий процесс

1. Найти точку входа (в 90% случаев: `api.ts` детектор → `InputArea.tsx` ветка → `routes.py` endpoint)
2. Читать только связанные файлы
3. Точечный фикс без рефакторинга вокруг
4. Если тронут `frontend/src` → `npm run build`
5. Перезапустить backend если тронут `routes.py` или Python-код

### Что нельзя

- Хардкодить список приложений, сайтов, алфавит/транслитерацию
- Менять `His-projects`, если задача не про них
- Использовать пути `C:\Users\Public\...` — workspace в `D:\projects\Jarvis\`
- Трогать backend если проблема только во frontend routing
- Ломать рабочий `play-youtube` path
- Добавлять настройки в `SettingsPage.tsx` — пользователь его не видит, добавлять в `JarvisApp.tsx`
- Ухудшать рабочие команды ради рефакторинга

### Нужны (принципы)

- Generic detectors для intents (regex-first, не hardcoded lists)
- Discovery вместо hardcode (LLM для неоднозначного, regex для явного)

---

## Диагностика

```powershell
# Проверить health backend
(Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing).Content

# Проверить Ollama (список моделей)
(Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing).Content

# Найти процесс на порту 8000
netstat -ano | Select-String ":8000.*LISTENING"

# Убить процесс на порту 8000
Stop-Process -Id <PID> -Force

# Проверить логи backend
Get-Content D:\projects\jarvis\backend_err.log -Tail 20

# Проверить свободное место на диске
$d = [System.IO.DriveInfo]::new("C:\"); "Free: $([math]::Round($d.AvailableFreeSpace/1MB,0)) MB"

# Проверить file-roots endpoint
(Invoke-WebRequest -Uri "http://127.0.0.1:8000/v1/tools/file-roots" -UseBasicParsing).Content
```

> **Проблема с портом 8000:** часто висит старый Python-процесс после Ctrl+C. Всегда проверять через `netstat`.  
> **Проблема с localhost:** на Windows `localhost` → `[::1]`, использовать `127.0.0.1`.  
> **`taskkill` в bash не работает** — использовать PowerShell `Stop-Process -Id <PID> -Force`.  
> **ENOSPC:** диск C: заполнен — очистить `%LOCALAPPDATA%\uv\cache` и `%LOCALAPPDATA%\npm-cache\content-v2`.  
> **Ollama 400:** `qwen3.5:cloud` — remote model. Базовый чат работает, сложные tool-use → 400. Fallback: `gemma4:e2b`.

---

## Справочник: где что чинить

| Симптом | Где смотреть |
|---------|-------------|
| Команда идёт не в тот path (напр. таймер → YouTube) | `isDirectPlaybackIntent` / порядок веток в `InputArea.tsx` |
| Детектор срабатывает не на те фразы | Функции-детекторы в `api.ts` (isOpen*, isDirect*, isResearch*) |
| "открой мой X" открывает приложение, а не файл | `isOpenAppIntent` — добавить исключение для нужной фразы |
| LLM-планировщик не вызывает нужный tool | `JARVIS_TOOLS_DESC` + ALWAYS-правила в `buildAgentPlan` |
| `find_and_open_file` не находит файл | Проверить `get_file_roots()` — добавить нужную директорию через `FileAccessPanel` |
| Backend endpoint возвращает ошибку | `routes.py` + Pydantic модели |
| Настройки не видны в `?jarvis=1` | `JarvisApp.tsx` → `SettingsPanel` → добавить компонент |
| Electron check-in не появляется | `desktop-mini/electron/main.cjs` + `/v1/checkin/settings` |
| Workflow "no actions were planned" | Stale closure — использовать `useAppStore.getState()` внутри async callback |
| Приложение не открывается через `open_app` | `executeAction` case `open_app` → `openLocalAppDirect` → `openLocalApp` |
