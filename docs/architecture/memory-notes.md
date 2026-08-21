# Система долгосрочной памяти Eidon

## Что это

Eidon умеет запоминать предпочтения пользователя и использовать их при обработке команд. Данные хранятся в `~/.openeidon/user_preferences.json` и сохраняются между перезапусками.

---

## Как это работает

### Хранилище

Файл: `~/.openeidon/user_preferences.json`

```json
{
  "work_apps": ["figma", "vs code", "claude"],
  "music": {
    "genres": ["rock"],
    "artists": ["acdc"]
  },
  "frequent_apps": {
    "figma": 5,
    "chrome": 3
  },
  "custom": {}
}
```

### Архитектура

```
Пользователь говорит → InputArea.tsx (fast-path routing)
                              ↓
              isSavePreferenceIntent?  →  setUserPreferences() → POST /v1/user/preferences/{category}
              isWorkAppsIntent?        →  getUserPreferences() → GET /v1/user/preferences → openLocalApp() для каждого
              isDirectPlaybackIntent + generic music? → getUserPreferences() → inject genre → playYouTubeQuery()
                              ↓
              (если ни одно не сработало) → Desktop agent (LLM) → может вызвать preferences_manage tool
```

**Слои:**

| Слой | Файл | Роль |
|------|------|------|
| Backend tool | `src/openeidon/tools/preferences_tool.py` | LLM-вызываемый инструмент; читает/пишет JSON |
| Backend API | `src/openeidon/server/routes.py` | REST: `GET /v1/user/preferences`, `POST /v1/user/preferences/{category}` |
| Frontend API | `frontend/src/lib/api.ts` | `getUserPreferences()`, `setUserPreferences()`, детекторы интентов |
| Frontend routing | `frontend/src/components/Chat/InputArea.tsx` | Fast-path блоки для save/open/music |

---

## Сценарии использования

### Сохранить рабочие программы

**Команда:** `запомни, что для работы я использую figma, vs code, claude`

**Что произойдёт:**
1. `isSavePreferenceIntent()` → `true`
2. Из текста парсятся приложения: `["figma", "vs code", "claude"]`
3. `setUserPreferences('work_apps', { apps: [...] })` → `POST /v1/user/preferences/work_apps`
4. Ответ: `"Запомнил рабочие программы: figma, vs code, claude"`

---

### Открыть рабочие программы

**Команда:** `открой программы для работы`

**Что произойдёт:**
1. `isWorkAppsIntent()` → `true`
2. `getUserPreferences()` → `GET /v1/user/preferences`
3. Для каждого app из `work_apps` вызывается `openLocalApp(app)` → `/v1/system/open-app`
4. Ответ: `"Открываю рабочие программы: figma, vs code, claude"`

---

### Сохранить музыкальные предпочтения

**Команда:** `запомни что я слушаю рок` или `я люблю рок музыку`

**Что произойдёт:**
1. `isSavePreferenceIntent()` → `true`
2. Из текста извлекаются жанры regex'ом: `["рок"]`
3. `setUserPreferences('music', { genres: ["рок"] })`
4. Ответ: `"Запомнил музыкальные предпочтения: рок"`

---

### Включить музыку с учётом предпочтений

**Команда:** `включи музыку` (без уточнения жанра)

**Что произойдёт:**
1. `isDirectPlaybackIntent()` → `true`
2. Текст соответствует паттерну `^(включи|play|поставь)\s+(музыку?|music)$`
3. `getUserPreferences()` → `genres: ["рок"]`
4. Запрос в YouTube: `"рок music"` вместо `"включи музыку"`

**Команда с уточнением:** `включи acdc` — preferences НЕ используются, запрос идёт как есть.

---

### LLM (desktop agent) может сам запоминать

Когда fast-path не срабатывает, запрос попадает в desktop agent (LLM). У него есть инструмент `preferences_manage` с действиями:
- `read` — прочитать все предпочтения
- `set_work_apps` — задать список рабочих приложений
- `set_music` — задать жанры/артистов
- `set_custom` — произвольный ключ-значение
- `increment_app` — увеличить счётчик использования приложения

---

## Управление через API (curl)

```bash
# Посмотреть текущие предпочтения
curl http://127.0.0.1:8000/v1/user/preferences

# Задать рабочие программы
curl -X POST http://127.0.0.1:8000/v1/user/preferences/work_apps \
  -H "Content-Type: application/json" \
  -d '{"apps": ["figma", "vs code", "claude"]}'

# Задать музыкальные предпочтения
curl -X POST http://127.0.0.1:8000/v1/user/preferences/music \
  -H "Content-Type: application/json" \
  -d '{"genres": ["rock"], "artists": ["acdc"]}'

# Произвольные настройки
curl -X POST http://127.0.0.1:8000/v1/user/preferences/custom \
  -H "Content-Type: application/json" \
  -d '{"preferred_browser": "chrome"}'
```

---

## Тест-кейсы

```
запомни, что для работы я использую figma, vs code, claude
  → "Запомнил рабочие программы: figma, vs code, claude"

открой программы для работы
  → открываются figma, vs code, claude

запомни что я слушаю рок
  → "Запомнил музыкальные предпочтения: рок"

включи музыку
  → YouTube: "рок music"

включи acdc
  → YouTube: "acdc" (предпочтения не применяются — запрос конкретный)
```

---

## Расширение

Чтобы добавить новую категорию предпочтений:
1. В `preferences_tool.py` добавить действие в `execute()`
2. В `routes.py` добавить `elif category == "new_cat":` в `update_user_preferences()`
3. В `api.ts` обновить интерфейс `UserPreferences`
4. Опционально добавить fast-path детектор в `InputArea.tsx`
