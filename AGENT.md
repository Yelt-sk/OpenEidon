# Jarvis Workspace Guide

## Что такое Jarvis

Jarvis в этом workspace — это локальный AI-ассистент для работы на компьютере пользователя.

Его главная практическая задача:

- принимать запросы пользователя
- выполнять задачи на компьютере
- открывать сайты и видео
- запускать приложения
- работать с файлами и проектами
- вести заметки и напоминания
- использовать речь для ввода/вывода

По архитектуре это не один файл, а связка:

- backend на Python/FastAPI
- frontend на React/Vite
- Ollama как inference engine
- agent/tool stack для действий на ПК

## На чем он работает

- backend: Python, FastAPI, OpenJarvis server code
- frontend: React + TypeScript + Vite
- inference: Ollama, в текущей сборке основной путь через `qwen3.5:cloud`
- speech: локальные speech backends в `src\openjarvis\speech`
- reminders/notes/projects: локальные файлы в workspace Jarvis

## Что он использует

- `D:\projects\Jarvis\OpenJarvis-main\src\openjarvis\server` — API server и routes
- `D:\projects\Jarvis\OpenJarvis-main\frontend\src` — UI, routing интентов, overlay, chat
- `D:\projects\Jarvis\OpenJarvis-main\src\openjarvis\tools` — tool implementations
- `D:\projects\Jarvis\OpenJarvis-main\src\openjarvis\speech` — речь
- `D:\projects\Jarvis\His-projects` — проекты, создаваемые Jarvis
- `D:\projects\Jarvis\markdown` — заметки
- `D:\projects\Jarvis\.jarvis-reminders.json` — напоминания

## Какие инструменты у него есть

Основные категории инструментов:

- browser tools — открытие сайтов, YouTube, извлечение контента страницы
- shell tools — запуск приложений и безопасные системные команды
- file tools — чтение/запись файлов в workspace
- project tools — создание файлов проектов в `His-projects`
- notes tools — сохранение и чтение markdown-заметок
- reminder tools — установка, список и отмена напоминаний
- speech tools — STT/TTS логика
- web search — поиск информации в интернете для research-сценариев

Где это лежит:

- `D:\projects\Jarvis\OpenJarvis-main\src\openjarvis\tools`
- `D:\projects\Jarvis\OpenJarvis-main\frontend\src\lib\api.ts`
- `D:\projects\Jarvis\OpenJarvis-main\frontend\src\components\Chat`

## Где что лежит

- `D:\projects\Jarvis\OpenJarvis-main` — основная кодовая база OpenJarvis.
- `D:\projects\Jarvis\His-projects` — папка, куда Jarvis должен создавать пользовательские проекты.
- `D:\projects\Jarvis\markdown` — заметки пользователя в формате Markdown.
- `D:\projects\Jarvis\.jarvis-reminders.json` — данные напоминаний.

## Ключевые зоны в OpenJarvis-main

- `frontend\src` — браузерный UI, маршрутизация пользовательских интентов, чат, overlay.
- `src\openjarvis\server` — FastAPI backend, API routes, static build output.
- `src\openjarvis\cli` — запуск `jarvis serve` и CLI-команды.
- `src\openjarvis\tools` — инструменты агента: browser, web_search, shell, file и т.д.
- `src\openjarvis\speech` — STT/TTS и связанная логика речи.
- `src\openjarvis\reminders` — напоминания.
- `src\openjarvis\server\static` — собранный frontend, который реально раздается backend'ом.

## Что важно помнить

- Рабочий UI для пользователя зависит от frontend build в `src\openjarvis\server\static`.
- После изменений в `frontend\src` почти всегда нужен `npm run build` в `D:\projects\Jarvis\OpenJarvis-main\frontend`.
- Не менять пользовательские проекты в `His-projects`, если задача не про них.
- Не подменять пути на `C:\Users\Public\...`; пользовательский workspace живет в `D:\projects\Jarvis\...`.
- Не забывать, что Jarvis должен именно выполнять задачи на ПК, а не отвечать как text-only чат там, где доступны tools.

## Как работать экономно по токенам

- Сначала читать только нужные файлы, а не большие директории целиком.
- Для поиска использовать точечные запросы по строкам/символам, а не обзор всего проекта.
- Не пересказывать пользователю большие куски кода; давать только итог и конкретные изменения.
- Не дублировать уже найденный контекст в каждом сообщении.
- Если проблема локальна, править один файл или маленький участок, а не переписывать модуль.
- Не гонять модель через агент без необходимости, если можно закрыть задачу прямым route/tool вызовом.
- Не добавлять хардкод там, где можно использовать существующие tools, routing или model-assisted selection.

## Практика для этого проекта

- Для UI-багов начинать с `frontend\src\components\Chat`, `frontend\src\lib\api.ts`, `frontend\src\lib\store.ts`.
- Для backend API смотреть `src\openjarvis\server\routes.py` и связанные router-файлы.
- Для проблем desktop app сначала проверять frontend/Tauri API base и только потом backend.
- Для browser/open/play сценариев предпочитать уже существующие browser endpoints и tools.
- Для app launching не хардкодить список приложений; опираться на discovery и/или выбор через модель.
- Для research/open сценариев сначала проверять routing intent'ов, потом уже backend/tool stack.

## Минимальный рабочий цикл

1. Найти точку входа проблемы.
2. Прочитать только связанные файлы.
3. Внести точечный фикс.
4. Если тронут frontend — собрать `npm run build`.
5. Проверить минимальный сценарий.
6. Коротко сообщить результат без длинного лога.
