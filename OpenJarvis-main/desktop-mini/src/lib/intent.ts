const API_BASE = "http://127.0.0.1:8000";
const MODEL = "qwen3.5:cloud";

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}

function stripGreetingPrefix(text: string): string {
  return text.replace(/^(привет|hi|hey|hello|ну|слушай|добрый день|добрый вечер|добрый утро)[,!\s]+/i, "").trim();
}

export function isOpenAppIntent(content: string): boolean {
  const text = stripGreetingPrefix(content.trim()).toLowerCase();
  return (
    (
      text.startsWith("open ") ||
      text.startsWith("launch ") ||
      text.startsWith("start ") ||
      text.startsWith("turn on ") ||
      text.startsWith("run ") ||
      text.startsWith("открой ") ||
      text.startsWith("запусти ")
    ) &&
    !text.includes("http://") &&
    !text.includes("https://") &&
    !text.includes("www.") &&
    !text.includes("сайт") &&
    !text.includes("site") &&
    !text.includes("youtube") &&
    !text.includes("ютуб") &&
    !text.includes("музык") &&
    !text.includes("music")
  );
}

export function isOpenSiteIntent(content: string): boolean {
  const text = content.trim().toLowerCase();
  return (
    text.startsWith("открой сайт") ||
    text.startsWith("open site") ||
    text.startsWith("open website") ||
    text.startsWith("open web site")
  );
}

export function isOpenMultipleSitesIntent(content: string): boolean {
  const text = content.trim().toLowerCase();
  return text.includes("найди") && text.includes("сайт") && text.includes("открой");
}

export function isDirectPlaybackIntent(content: string): boolean {
  const text = stripGreetingPrefix(content.trim());
  const lower = text.toLowerCase();
  if (
    lower.includes("google") ||
    lower.includes("погугл") ||
    lower.includes("огугл") ||
    lower.includes("найди") ||
    lower.includes("find") ||
    lower.includes("search")
  ) return false;
  return (
    /^(start|play|turn on|put on|launch)(?:\s|$)/i.test(text) ||
    /^(включи|поставь|запусти)(?:\s|$)/i.test(text)
  ) && !/(https?:\/\/|www\.)/i.test(text);
}

export function isResearchThenVideoIntent(content: string): boolean {
  const text = content.trim().toLowerCase();
  const asksToResearch =
    text.includes("google") || text.includes("погугл") || text.includes("огугл") ||
    text.includes("загугл") || text.includes("search") || text.includes("найди");
  const asksForVideo =
    text.includes("youtube") || text.includes("ютуб") ||
    text.includes("видео") || text.includes("video");
  const asksToOpen = text.includes("открой") || text.includes("open");
  return asksToResearch && asksForVideo && asksToOpen;
}

export function normalizePlaybackQuery(content: string): string {
  const compact = content.trim().replace(/\s+/g, " ");
  const stripped = compact
    .replace(/^(play|start|turn on|put on|launch|open|включи|поставь|запусти|открой)\s+/i, "")
    .replace(/^(мне\s+|please\s+|hey\s+|bro\s+)/i, "")
    .trim()
    .replace(/^[-,:;.!?\s]+|[-,:;.!?\s]+$/g, "");
  return stripped || compact;
}

function buildSiteTarget(content: string): string {
  const raw = content.trim();
  if (/(https?:\/\/|www\.)/i.test(raw)) return raw;
  const cleaned = raw.toLowerCase()
    .replace(/^открой сайт\s*/i, "")
    .replace(/^open (site|website|web site)\s*/i, "")
    .trim();
  return `https://www.google.com/search?q=${encodeURIComponent(cleaned || "пиво")}`;
}

// ---------------------------------------------------------------------------
// Actions → backend endpoints
// ---------------------------------------------------------------------------

export async function classifyIntent(query: string): Promise<{ category: string; subject: string }> {
  try {
    return await apiPost<{ category: string; subject: string }>("/v1/intent/classify", { query });
  } catch {
    return { category: "chat", subject: "" };
  }
}

export function isAmbiguousPlaybackIntent(content: string): boolean {
  const text = stripGreetingPrefix(content.trim()).toLowerCase();
  if (
    text.includes("http://") || text.includes("https://") || text.includes("www.") ||
    text.includes("сайт") || text.includes("site") ||
    text.includes("youtube") || text.includes("ютуб") ||
    text.includes("видео") || text.includes("video") ||
    text.includes("найди") || text.includes("find") ||
    text.includes("открой") || text.includes("open ")
  ) return false;
  return (
    /^(включи|start|play|turn on|put on)(?:\s|$)/i.test(text)
  );
}

export async function openLocalApp(query: string): Promise<string> {
  const res = await apiPost<{ ok: boolean; opened: string }>("/v1/system/open-app", { query });
  const opened = res.opened || "";
  if (!opened || opened.toLowerCase() === query.toLowerCase()) {
    return `Пытаюсь открыть: ${query}`;
  }
  return opened;
}

export async function openExternalTarget(target: string): Promise<string> {
  const res = await apiPost<{ ok: boolean; opened: string }>("/v1/browser/open-external", { target });
  return res.opened || target;
}

export async function openSearchSites(query: string): Promise<string> {
  const res = await apiPost<{ ok: boolean; opened: string[]; query: string }>(
    "/v1/browser/open-search-sites",
    { query, limit: 3 },
  );
  return `Открыл сайты по запросу: ${res.query}`;
}

export function isCreateProjectIntent(content: string): boolean {
  const text = stripGreetingPrefix(content.trim()).toLowerCase();
  return (
    (text.startsWith("создай проект") || text.startsWith("создай сайт") ||
     text.startsWith("создай приложение") || text.startsWith("create project") ||
     text.startsWith("create a project") || text.startsWith("create a website") ||
     text.startsWith("create a web") || text.startsWith("create an app") ||
     text.startsWith("сделай сайт") || text.startsWith("сделай приложение")) &&
    !text.includes("http://") && !text.includes("https://")
  );
}

export async function generateProject(query: string): Promise<string> {
  const res = await apiPost<{ ok: boolean; project_name: string; opened_path: string; files: string[] }>(
    "/v1/projects/generate",
    { prompt: query, model: MODEL },
  );
  const files = res.files?.map((f) => `• ${f}`).join("\n") ?? "";
  return `Проект «${res.project_name}» создан:\n${files}`;
}

export async function playYouTubeQuery(query: string): Promise<string> {
  const normalized = normalizePlaybackQuery(query);
  const res = await apiPost<{ ok: boolean; message?: string }>(
    "/v1/browser/play-youtube",
    { query: normalized },
  );
  return res.message || `Открываю YouTube: ${normalized}`;
}

export async function researchThenOpenYouTube(query: string): Promise<string> {
  try {
    const res = await apiPost<{ ok: boolean; answer: string; youtube_query: string; opened: string }>(
      "/v1/browser/research-youtube",
      { query },
    );
    return res.answer || res.youtube_query || "Готово";
  } catch (err: unknown) {
    const msg = String((err as Error)?.message ?? "");
    if (/(404|405|Not Found)/i.test(msg)) {
      return playYouTubeQuery(normalizePlaybackQuery(query));
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Desktop agent fallback (managed agent with tools)
// ---------------------------------------------------------------------------

const AGENT_NAME = "Desktop Chat Agent";
const AGENT_PROMPT = [
  "You are Eidon, an AI assistant running on the user's Windows PC.",
  "You have real access to tools on this machine.",
  "CRITICAL: You MUST call at least one tool before responding. NEVER write 'Opened', 'Done', 'Launched', or 'Playing' without having JUST called the corresponding tool successfully.",
  "For opening URLs or apps: prefer shell_exec (e.g. Start-Process) over browser tools — browser tools run headless and the user will NOT see them.",
  "For volume, brightness, screen, and other system settings: use shell_exec with PowerShell (e.g. Set-Volume, (Get-AudioDevice -Playback).Volume).",
  "Use web_search for real-time facts or when the user asks to google/find/search.",
  "Use save_markdown_note, list_markdown_notes, read_markdown_note for personal notes.",
  "Use set_reminder, list_reminders, cancel_reminder for reminders.",
  "Use create_project_file, list_project_files, read_project_file, open_project_file for code projects in D:\\projects\\Jarvis\\His-projects.",
  "When asked to play music, prefer YouTube Music, otherwise YouTube search via shell_exec opening a browser URL.",
  "Do not claim you cannot access the computer when browser or shell tools can solve it.",
  "For dangerous actions (delete files, system settings, install software) ask for confirmation first.",
  "Reply in the same language the user used.",
].join(" ");

async function fetchManagedAgents(): Promise<Array<{ id: string; name: string; status: string; config: Record<string, unknown> }>> {
  const res = await fetch(`${API_BASE}/v1/managed-agents`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.agents || [];
}

async function createManagedAgent(body: Record<string, unknown>): Promise<{ id: string }> {
  return apiPost("/v1/managed-agents", body);
}

async function updateManagedAgent(id: string, body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/v1/managed-agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Update agent failed: ${res.status}`);
  return res.json();
}

async function deleteManagedAgent(id: string): Promise<void> {
  await fetch(`${API_BASE}/v1/managed-agents/${id}`, { method: "DELETE" });
}

function buildAgentConfig(): Record<string, unknown> {
  return {
    instruction: AGENT_PROMPT,
    tools: [
      "browser", "browser_navigate", "browser_open_youtube_first_result",
      "browser_click", "browser_type", "browser_screenshot", "browser_extract",
      "web_search", "shell_exec", "file_read", "file_write",
      "save_markdown_note", "list_markdown_notes", "read_markdown_note",
      "set_reminder", "list_reminders", "cancel_reminder",
      "create_project_file", "list_project_files", "read_project_file", "open_project_file",
    ],
    model: MODEL,
    max_turns: 6,
    temperature: 0.2,
  };
}

async function ensureAgent(): Promise<string> {
  const agents = await fetchManagedAgents();
  const config = buildAgentConfig();

  const idle = agents.find(
    (a) => a.name === AGENT_NAME && (a.status === "idle" || a.status === "paused"),
  );
  if (idle) {
    if (JSON.stringify(idle.config) !== JSON.stringify(config)) {
      await updateManagedAgent(idle.id, { config });
    }
    return idle.id;
  }

  for (const a of agents.filter((a) => a.name === AGENT_NAME)) {
    await deleteManagedAgent(a.id).catch(() => {});
  }

  const created = await createManagedAgent({
    name: AGENT_NAME,
    agent_type: "operative",
    config,
  });
  return created.id;
}

export async function runDesktopAgent(
  message: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal: AbortSignal,
  onTool?: (tool: string | null) => void,
): Promise<void> {
  let agentId: string;
  try {
    agentId = await ensureAgent();
  } catch (err) {
    onError(`Не удалось запустить агент: ${(err as Error)?.message}`);
    return;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/managed-agents/${agentId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message, mode: "immediate", stream: true }),
      signal,
    });
  } catch (err: unknown) {
    if ((err as Error)?.name === "AbortError") return;
    onError("Ошибка подключения к агенту.");
    return;
  }

  if (!res.ok) {
    onError(`Ошибка агента: ${res.status}`);
    return;
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !res.body) {
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    onChunk((data as { content?: string }).content || JSON.stringify(data));
    onDone();
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          continue;
        }
        if (!line.startsWith("data: ")) { currentEvent = ""; continue; }
        const data = line.slice(6).trim();
        if (data === "[DONE]") { onTool?.(null); onDone(); return; }

        if (currentEvent === "tool_result") {
          try {
            const j = JSON.parse(data) as { tool_name?: string };
            if (j.tool_name) onTool?.(j.tool_name);
          } catch { /* skip */ }
          currentEvent = "";
          continue;
        }

        try {
          const json = JSON.parse(data) as Record<string, unknown>;
          const choice = (json.choices as Array<Record<string, unknown>>)?.[0];
          const toolProgress = choice?.tool_progress as string | undefined;
          if (toolProgress) { onTool?.(toolProgress); continue; }
          const delta = (choice?.delta as { content?: string })?.content;
          if (delta) { onTool?.(null); onChunk(delta); }
        } catch { /* skip */ }
        currentEvent = "";
      }
    }
  } catch (err: unknown) {
    if ((err as Error)?.name === "AbortError") return;
  }

  onTool?.(null);
  onDone();
}

// ---------------------------------------------------------------------------
// Main router — called from handleSend in index.tsx
// ---------------------------------------------------------------------------

export async function routeIntent(
  content: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  signal: AbortSignal,
  onTool?: (tool: string | null) => void,
): Promise<void> {
  const text = stripGreetingPrefix(content.trim());

  try {
    if (isCreateProjectIntent(content)) {
      const result = await generateProject(text);
      onChunk(result); onDone(); return;
    }
    if (isOpenMultipleSitesIntent(content)) {
      const result = await openSearchSites(text);
      onChunk(result); onDone(); return;
    }
    if (isOpenSiteIntent(content)) {
      const result = await openExternalTarget(buildSiteTarget(content));
      onChunk(result); onDone(); return;
    }
    if (isResearchThenVideoIntent(content)) {
      const result = await researchThenOpenYouTube(text);
      onChunk(result); onDone(); return;
    }
    if (isAmbiguousPlaybackIntent(content)) {
      const { category } = await classifyIntent(content);
      if (category === "app") {
        const result = await openLocalApp(text);
        onChunk(result); onDone(); return;
      }
      if (category === "system_cmd") {
        // fall through to agent (handles volume/brightness via shell_exec)
      } else {
        // "media" or "chat" or unknown → treat as media playback
        const result = await playYouTubeQuery(text);
        onChunk(result); onDone(); return;
      }
    } else {
      if (isOpenAppIntent(content)) {
        const result = await openLocalApp(text);
        onChunk(result); onDone(); return;
      }
      if (isDirectPlaybackIntent(content)) {
        const result = await playYouTubeQuery(text);
        onChunk(result); onDone(); return;
      }
    }
  } catch (err: unknown) {
    if ((err as Error)?.name === "AbortError") return;
    // fast-path failed → fall through to agent
  }

  // Desktop agent fallback
  await runDesktopAgent(content, onChunk, onDone, onError, signal, onTool);
}
