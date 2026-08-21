import type { ModelInfo, SavingsData, ServerInfo } from '../types';

// ---------------------------------------------------------------------------
// Supabase config вЂ” safe to embed (RLS protects writes)
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  }
}

export const isTauri = () => {
  if (typeof window === 'undefined') return false;
  const protocol = window.location?.protocol || '';
  const host = window.location?.host || '';
  return (
    !!window.__TAURI_INTERNALS__ ||
    !!window.__TAURI__ ||
    protocol === 'tauri:' ||
    host.includes('tauri.localhost')
  );
};

// Cached API base URL fetched from the Tauri backend at startup.
// This avoids hardcoding the port вЂ” the Rust backend is the single
// source of truth for EIDON_PORT.
let _tauriApiBase: string | null = null;

/** Pre-fetch the API base URL from the Tauri backend (call once at init). */
export async function initApiBase(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    _tauriApiBase = await invoke<string>('get_api_base');
  } catch {
    // Command may not exist on older builds; fall through to default.
  }
}

const DESKTOP_API_FALLBACK = 'http://127.0.0.1:8000';

const getSettingsApiUrl = (): string => {
  try {
    const raw = localStorage.getItem('openeidon-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.apiUrl) return parsed.apiUrl.replace(/\/+$/, '');
    }
  } catch {}
  return '';
};

export const getBase = (): string => {
  if (isTauri()) return _tauriApiBase || DESKTOP_API_FALLBACK;
  const settingsUrl = getSettingsApiUrl();
  if (settingsUrl) return settingsUrl;
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    const protocol = window.location?.protocol || '';
    const host = window.location?.host || '';
    if (protocol === 'tauri:' || host.includes('tauri.localhost')) {
      return DESKTOP_API_FALLBACK;
    }
  }
  return '';
};

async function tauriInvoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  const apiUrl = getBase();
  return invoke<T>(command, { apiUrl, ...args });
}

async function apiJsonRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  if (isTauri()) {
    return tauriInvoke<T>('api_json_request', { method, path, body: body ?? null });
  }

  const res = await fetch(`${getBase()}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Setup status (desktop only)
// ---------------------------------------------------------------------------

export interface SetupStatus {
  phase: string;
  detail: string;
  ollama_ready: boolean;
  server_ready: boolean;
  model_ready: boolean;
  error: string | null;
}

export async function getSetupStatus(): Promise<SetupStatus | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<SetupStatus>('get_setup_status');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchModels(): Promise<ModelInfo[]> {
  if (isTauri()) {
    try {
      const result = await tauriInvoke<{ data?: ModelInfo[] }>('fetch_models');
      return result?.data || [];
    } catch {
      // Fall through to fetch
    }
  }
  const res = await fetch(`${getBase()}/v1/models`);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function fetchRecommendedModel(): Promise<{ model: string; reason: string }> {
  const res = await fetch(`${getBase()}/v1/recommended-model`);
  if (!res.ok) return { model: '', reason: 'Failed to fetch' };
  return res.json();
}

export async function pullModel(modelName: string): Promise<void> {
  // In Tauri, go through the Rust backend directly (avoids CORS / timeout
  // issues with long model downloads via fetch).
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('pull_ollama_model', { modelName });
      return;
    } catch (e: any) {
      throw new Error(e?.message || e || 'Download failed');
    }
  }
  const res = await fetch(`${getBase()}/v1/models/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to pull model: ${detail}`);
  }
}

export async function deleteModel(modelName: string): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_ollama_model', { modelName });
      return;
    } catch (e: any) {
      throw new Error(e?.message || e || 'Delete failed');
    }
  }
  const res = await fetch(`${getBase()}/v1/models/${encodeURIComponent(modelName)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to delete model: ${detail}`);
  }
}

const _CLOUD_PREFIXES = ['gpt-', 'o1-', 'o3-', 'o4-', 'claude-', 'gemini-', 'openrouter/'];

export async function preloadModel(modelName: string): Promise<void> {
  // Cloud models don't need Ollama preloading
  if (_CLOUD_PREFIXES.some(p => modelName.startsWith(p))) {
    return;
  }
  // Trigger Ollama to load the model into memory (empty prompt, no generation).
  const ollamaUrl = 'http://127.0.0.1:11434';
  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, prompt: '', keep_alive: '5m' }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Preload failed: ${res.status}`);
  } catch (e: any) {
    if (e.name === 'TimeoutError') throw new Error('Model load timed out (120s)');
    throw e;
  }
}

export async function fetchSavings(): Promise<SavingsData> {
  const res = await fetch(`${getBase()}/v1/savings`);
  if (!res.ok) throw new Error(`Failed to fetch savings: ${res.status}`);
  return res.json();
}

export async function fetchServerInfo(): Promise<ServerInfo> {
  const res = await fetch(`${getBase()}/v1/info`);
  if (!res.ok) throw new Error(`Failed to fetch server info: ${res.status}`);
  return res.json();
}

function stripGreetingPrefix(text: string): string {
  return text
    .replace(/^(джарвис|eidon|ейдон|eidon)[,!\s]+/i, '')
    .replace(/^(привет|hi|hey|hello|ну|слушай|добрый день|добрый вечер|добрый утро)[,!\s]+/i, '')
    .trim();
}

// Detect "включи какую-нибудь из них", "поставь одну из этих", "хочу послушать" etc.
export function isContextualPlaybackIntent(content: string): boolean {
  const text = stripGreetingPrefix(content.trim()).toLowerCase();
  if (/включи.{0,25}(из них|из этих|из этого|одну|какую.нибудь|любую|первую|вторую|третью)/i.test(text)) return true;
  if (/поставь.{0,25}(из них|из этих|одну|какую.нибудь|любую)/i.test(text)) return true;
  if (/(хочу послушать|хочу услышать)/.test(text)) return true;
  if (/можешь (включить|поставить|запустить).{0,20}(их|это|одну|что.нибудь)/.test(text)) return true;
  if (/play (one|any|some) of (them|these|those)/i.test(text)) return true;
  return false;
}

// Extract bold-marked entities (**Name**) from assistant message — typical for lists of bands/artists
export function extractBoldEntities(text: string): string[] {
  const matches = text.match(/\*\*([^*\n]{2,60})\*\*/g) || [];
  return [...new Set(matches.map((m) => m.replace(/\*\*/g, '').trim()).filter(Boolean))];
}

export function isDirectPlaybackIntent(content: string): boolean {
  const text = stripGreetingPrefix(content.trim());
  const lower = text.toLowerCase();
  if (
    lower.includes('google') ||
    lower.includes('погугл') ||
    lower.includes('огугл') ||
    lower.includes('найди') ||
    lower.includes('find') ||
    lower.includes('search') ||
    lower.includes('таймер') ||
    lower.includes('timer') ||
    lower.includes('напомни') ||
    lower.includes('remind') ||
    lower.includes('напоминан')
  ) {
    return false;
  }
  return (
    /^(start|play|turn on|put on|launch)(?:\s|$)/i.test(text) ||
    /^(включи|поставь|запусти)(?:\s|$)/i.test(text)
  ) &&
    !/(https?:\/\/|www\.)/i.test(text);
}

export function isResearchThenVideoIntent(content: string): boolean {
  const text = content.trim().toLowerCase();
  const asksToResearch =
    text.includes('google') ||
    text.includes('погугл') ||
    text.includes('огугл') ||
    text.includes('загугл') ||
    text.includes('look up') ||
    text.includes('search') ||
    text.includes('найди') ||
    text.includes('find');
  const asksForVideo =
    text.includes('youtube') ||
    text.includes('ютуб') ||
    text.includes('видео') ||
    text.includes('video');
  const asksToOpen =
    text.includes('открой') ||
    text.includes('open');
  return asksToResearch && asksForVideo && asksToOpen;
}

function extractResearchTopic(query: string): string {
  let text = query.trim();
  text = text
    .replace(/^(please|hey|bro|ну|слушай)\s+/i, '')
    .replace(/^(google|find|search|look up)\s+/i, '')
    .replace(/^(погугли|огугли|загугли|найди)\s+/i, '')
    .replace(/\s+(in youtube|on youtube|в ютубе|в ютуб|на ютубе|на ютуб)\b/gi, '')
    .replace(/\s+(and then|then|и затем|а потом|потом)\s+/gi, ' ')
    .replace(/\s+(open|открой)\s+(video|видео).*/i, '')
    .replace(/\s+(open|открой).*/i, '')
    .replace(/\s+(video|видео)\s+(about|про)\s+/i, ' ')
    .trim();

  const aboutMatch = text.match(/\babout\s+(.+)$/i);
  if (aboutMatch?.[1]) return aboutMatch[1].trim();
  const ruAboutMatch = text.match(/(?:^|\s)про\s+(.+)$/i);
  if (ruAboutMatch?.[1]) return ruAboutMatch[1].trim();
  return text;
}

export async function playYouTubeQuery(query: string): Promise<{ message: string; metadata?: Record<string, unknown> }> {
  try {
    return await apiJsonRequest<{ message: string; metadata?: Record<string, unknown> }>(
      'POST',
      '/v1/browser/play-youtube',
      { query: normalizePlaybackQuery(query) },
    );
  } catch (error: any) {
    throw new Error(`Direct playback failed: ${error?.message || String(error)}`);
  }
}

function extractResearchPlaybackPayload(raw: string): { answer: string; youtube_query: string } {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || text).trim();
  try {
    const parsed = JSON.parse(candidate);
    return {
      answer: String(parsed?.answer || '').trim(),
      youtube_query: String(parsed?.youtube_query || '').trim(),
    };
  } catch {
    return { answer: '', youtube_query: '' };
  }
}

export async function researchThenOpenYouTube(query: string): Promise<{ ok: boolean; answer: string; youtube_query: string; opened: string; source?: Record<string, string> }> {
  try {
    return await apiJsonRequest<{ ok: boolean; answer: string; youtube_query: string; opened: string; source?: Record<string, string> }>(
      'POST',
      '/v1/browser/research-youtube',
      { query },
    );
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (!/(404|405|Not Found|Method Not Allowed)/i.test(message)) {
      throw error;
    }

    const topic = extractResearchTopic(query);
    const youtubeQuery = topic || normalizePlaybackQuery(query);
    const playback = await playYouTubeQuery(youtubeQuery);
    return {
      ok: true,
      answer: topic || youtubeQuery,
      youtube_query: youtubeQuery,
      opened: String(playback?.metadata?.url || playback?.metadata?.search_url || ''),
    };
  }
}

export function normalizePlaybackQuery(content: string): string {
  const compact = content.trim().replace(/\s+/g, ' ');
  const stripped = compact
    .replace(/^(play|start|turn on|put on|launch|open|включи|поставь|запусти|открой)\s+/i, '')
    .replace(/^(мне\s+|please\s+|hey\s+|bro\s+)/i, '')
    .trim()
    .replace(/^[-,:;.!?\s]+|[-,:;.!?\s]+$/g, '');
  return stripped || compact;
}

export function isProjectCreateIntent(content: string): boolean {
  const lower = content.trim().toLowerCase();
  return (
    (lower.includes('\u0441\u043e\u0437\u0434\u0430\u0439') || lower.includes('create')) &&
    (
      lower.includes('\u043f\u0440\u043e\u0435\u043a\u0442') ||
      lower.includes('project') ||
      lower.includes('.html') ||
      lower.includes('.css') ||
      lower.includes('.js') ||
      lower.includes('.ts') ||
      lower.includes('.py')
    )
  );
}

export function isOpenAppIntent(content: string): boolean {
  const text = stripGreetingPrefix(content.trim()).toLowerCase();
  return (
    (
      text.startsWith('open ') ||
      text.startsWith('launch ') ||
      text.startsWith('start ') ||
      text.startsWith('turn on ') ||
      text.startsWith('run ') ||
      text.startsWith('\u043e\u0442\u043a\u0440\u043e\u0439 ') ||
      text.startsWith('\u0437\u0430\u043f\u0443\u0441\u0442\u0438 ') ||
      text.startsWith('\u0432\u043a\u043b\u044e\u0447\u0438 ')
    ) &&
    !text.includes('http://') &&
    !text.includes('https://') &&
    !text.includes('www.') &&
    !text.includes('\u0441\u0430\u0439\u0442') &&
    !text.includes('site') &&
    !text.includes('youtube') &&
    !text.includes('\u044e\u0442\u0443\u0431') &&
    !text.includes('\u043c\u0443\u0437\u044b\u043a') &&
    !text.includes('music') &&
    // file-open intents \u2014 should go to find_and_open_file, not open_app
    !text.includes('\u043c\u043e\u0451') &&    // \u043c\u043e\u0451
    !text.includes('\u043c\u043e\u044e') &&    // \u043c\u043e\u044e
    !text.includes('\u043c\u043e\u0439') &&    // \u043c\u043e\u0439
    !text.includes('\u043c\u043e\u0438') &&    // \u043c\u043e\u0438
    !text.includes('\u0444\u0430\u0439\u043b') &&  // \u0444\u0430\u0439\u043b
    !text.includes('\u0434\u043e\u043a\u0443\u043c') &&  // \u0434\u043e\u043a\u0443\u043c
    !text.includes('\u043a\u0443\u0440\u0441\u043e\u0432') &&  // \u043a\u0443\u0440\u0441\u043e\u0432
    !text.includes('\u0434\u0438\u043f\u043b') &&   // \u0434\u0438\u043f\u043b
    !text.includes('\u043e\u0442\u0447\u0451\u0442') &&  // \u043e\u0442\u0447\u0451\u0442
    !text.includes('\u043e\u0442\u0447\u0435\u0442') &&  // \u043e\u0442\u0447\u0435\u0442
    !text.includes('\u043f\u0440\u0435\u0437\u0435\u043d\u0442\u0430') &&  // \u043f\u0440\u0435\u0437\u0435\u043d\u0442\u0430
    !text.includes('file') &&
    !text.includes('document') &&
    !text.includes('.docx') &&
    !text.includes('.pdf') &&
    !text.includes('.xlsx') &&
    !text.includes('.pptx')
  );
}


export function isOpenSiteIntent(content: string): boolean {
  const text = content.trim().toLowerCase();
  return (
    text.startsWith('\u043e\u0442\u043a\u0440\u043e\u0439 \u0441\u0430\u0439\u0442') ||
    text.startsWith('open site') ||
    text.startsWith('open website') ||
    text.startsWith('open web site')
  );
}

export function isOpenMultipleSitesIntent(content: string): boolean {
  const text = content.trim().toLowerCase();
  const asksToFind = text.includes('\u043d\u0430\u0439\u0434') || text.includes('find');
  const asksForSites = text.includes('\u0441\u0430\u0439\u0442') || text.includes('site');
  const asksToOpen = text.includes('\u043e\u0442\u043a\u0440') || text.includes('open');
  return asksToFind && asksForSites && asksToOpen;
}

export function extractSitesSearchQuery(content: string): string {
  return content
    .trim()
    .replace(/^(найди|find)\s+/i, '')
    .replace(/(крутые|лучшие|good|best)\s+/gi, '')
    .replace(/(сайты|sites?)\s+/gi, '')
    .replace(/(и открой их|and open them|открой их|open them)$/i, '')
    .trim() || 'interesting websites';
}

export function buildSiteTarget(content: string): string {
  const raw = content.trim();
  const hasUrl = /(https?:\/\/|www\.)/i.test(raw);
  if (hasUrl) {
    return raw;
  }
  const lower = raw.toLowerCase();
  const cleaned = lower
    .replace(/^\u043e\u0442\u043a\u0440\u043e\u0439 \u0441\u0430\u0439\u0442\s*/i, '')
    .replace(/^open (site|website|web site)\s*/i, '')
    .trim();
  const query = cleaned || '\u043f\u0438\u0432\u043e';
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export async function openExternalTarget(target: string): Promise<{ ok: boolean; opened: string }> {
  try {
    return await apiJsonRequest<{ ok: boolean; opened: string }>('POST', '/v1/browser/open-external', { target });
  } catch (error: any) {
    throw new Error(error?.message || String(error));
  }
}

export async function openSearchSites(query: string, limit = 3): Promise<{ ok: boolean; opened: string[]; query: string }> {
  return apiJsonRequest<{ ok: boolean; opened: string[]; query: string }>(
    'POST',
    '/v1/browser/open-search-sites',
    { query, limit },
  );
}

export async function openLocalApp(query: string): Promise<{ ok: boolean; opened: string; query: string }> {
  return apiJsonRequest<{ ok: boolean; opened: string; query: string }>(
    'POST',
    '/v1/system/open-app',
    { query },
  );
}

export async function openLocalAppDirect(name: string): Promise<{ ok: boolean; opened: string }> {
  return apiJsonRequest<{ ok: boolean; opened: string }>('POST', '/v1/system/open-app-direct', { name });
}

export async function fetchInstalledApps(): Promise<string[]> {
  try {
    const data = await apiJsonRequest<{ apps: string[] }>('GET', '/v1/system/apps');
    return data.apps || [];
  } catch {
    return [];
  }
}

export async function fetchRunningProcesses(): Promise<string[]> {
  try {
    const data = await apiJsonRequest<{ processes: string[] }>('GET', '/v1/system/processes');
    return data.processes || [];
  } catch {
    return [];
  }
}

export async function setReminder(text: string, delay_seconds?: number, due_at?: string): Promise<{ reminder: { id: string; text: string; due_at: string } }> {
  return apiJsonRequest('POST', '/v1/reminders/set', { text, delay_seconds, due_at });
}

export async function fetchReminders(): Promise<Array<{ id: string; text: string; due_at: string; status: string }>> {
  try {
    const data = await apiJsonRequest<{ alerts: Array<{ id: string; text: string; due_at: string; status: string }> }>('GET', '/v1/reminders/alerts');
    return data.alerts || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Web Search
// ---------------------------------------------------------------------------

export async function webSearch(query: string, maxResults = 5): Promise<{ content: string; success: boolean }> {
  return apiJsonRequest('POST', '/v1/tools/web-search', { query, max_results: maxResults });
}

export async function readFile(path: string, maxChars = 8000): Promise<{ content: string; truncated: boolean; total_chars: number; path: string }> {
  return apiJsonRequest('POST', '/v1/tools/file-read', { path, max_chars: maxChars });
}

export async function writeFile(path: string, content: string, append = false): Promise<{ status: string; path: string; bytes: number }> {
  return apiJsonRequest('POST', '/v1/tools/file-write', { path, content, append });
}

export async function listFiles(path: string): Promise<{ entries: { name: string; type: string; size: number | null }[]; path: string }> {
  return apiJsonRequest('POST', '/v1/tools/file-list', { path });
}

export async function findAndOpenFile(query: string): Promise<{ opened: boolean; path?: string; matches?: string[]; message: string }> {
  return apiJsonRequest('POST', '/v1/tools/file-find-open', { query });
}

export async function getFileRoots(): Promise<{ roots: string[]; defaults: string[]; custom: string[] }> {
  try {
    const res = await fetch(`${getBase()}/v1/tools/file-roots`);
    if (!res.ok) return { roots: [], defaults: [], custom: [] };
    return res.json();
  } catch {
    return { roots: [], defaults: [], custom: [] };
  }
}

export async function setFileRoots(customRoots: string[]): Promise<void> {
  await fetch(`${getBase()}/v1/tools/file-roots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roots: customRoots }),
  });
}

export function isWebSearchIntent(content: string): boolean {
  const text = stripGreetingPrefix(content.trim()).toLowerCase();
  // "найди" + интернет/онлайн/сеть в любом порядке в той же фразе
  if (/найди/.test(text) && /интернет|онлайн|в сети/.test(text)) return true;
  // прямые команды поиска
  if (/поищи|погугли|загугли|поиск в интернете/.test(text)) return true;
  // новости в любом падеже — ключевые прилагательные + новост*
  if (/последни[еёхм]?\s+новост|свежи[еёхм]?\s+новост|актуальн\S*\s+новост/.test(text)) return true;
  if (/новости сегодня|что нового|что сейчас происходит|последние события/.test(text)) return true;
  // реальное время
  if (/текущий курс|курс доллара|курс евро|курс рубля|погода сейчас|цена на/.test(text)) return true;
  // английский
  if (/search the web|look it up|find online|latest news|current news/.test(text)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// User Preferences
// ---------------------------------------------------------------------------

export interface UserPreferences {
  work_apps: string[];
  music: { genres: string[]; artists: string[] };
  frequent_apps: Record<string, number>;
  custom: Record<string, unknown>;
}

const _prefsDefaultCache: UserPreferences = {
  work_apps: [],
  music: { genres: [], artists: [] },
  frequent_apps: {},
  custom: {},
};

export async function getUserPreferences(): Promise<UserPreferences> {
  try {
    const res = await fetch(`${getBase()}/v1/user/preferences`);
    if (!res.ok) return { ..._prefsDefaultCache };
    return res.json();
  } catch {
    return { ..._prefsDefaultCache };
  }
}

export async function setUserPreferences(category: string, body: object): Promise<void> {
  try {
    await fetch(`${getBase()}/v1/user/preferences/${category}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Silently ignore network errors — preferences are best-effort
  }
}

// ---------------------------------------------------------------------------
// Multi-action agent plan
// ---------------------------------------------------------------------------

export interface AgentAction {
  tool: 'open_app' | 'play_youtube' | 'open_site' | 'open_work_apps' | 'show_message' | 'list_installed_apps' | 'list_running_processes' | 'set_reminder' | 'list_reminders' | 'cancel_reminder' | 'web_search' | 'save_preference' | 'read_file' | 'write_file' | 'list_files' | 'find_and_open_file';
  category?: string;
  value?: string;
  name?: string;
  path?: string;      // for read_file / write_file / list_files
  file_content?: string; // for write_file
  query?: string;
  url?: string;
  text?: string;
  delay_seconds?: number;
  due_at?: string;
  reminder_id?: string;
}

export interface AgentStep {
  mode: 'parallel' | 'sequential';
  actions: AgentAction[];
}

export interface AgentPlan {
  steps: AgentStep[];
  summary: string;
}

const EIDON_TOOLS_DESC = [
  'open_app(name) — opens a desktop application by name',
  'play_youtube(query) — plays music or video on YouTube',
  'open_site(url) — opens a website URL in browser',
  'open_work_apps() — opens all saved work applications from user preferences',
  'show_message(text) — shows a text message to the user',
  'list_installed_apps() — returns list of apps installed on the PC',
  'list_running_processes() — returns list of currently running processes',
  'set_reminder(text, delay_seconds) — set a timer/reminder; delay_seconds is integer seconds from now; text is what to remind',
  'list_reminders() — list all active reminders/timers',
  'cancel_reminder(reminder_id) — cancel a reminder by its id',
  'web_search(query) — search the internet for current/real-time information, news, facts',
  'save_preference(category, value) — save a user fact to memory. Categories: "music_artist" (band/singer name), "music_genre" (genre like rock/jazz), "work_app" (app name), "note" (any other fact about the user)',
  'read_file(path) — read the contents of a file on disk. Use full path, e.g. D:\\projects\\eidon\\notes.md',
  'write_file(path, file_content) — write or overwrite a file on disk',
  'list_files(path) — list files and folders in a directory',
  'find_and_open_file(query) — search for a file by name across accessible directories and open it with the default app. Use when user says "открой мою курсовую", "открой мой диплом", "открой отчёт" etc. without specifying exact path.',
].join('\n');

export function isMultiActionIntent(content: string): boolean {
  const text = stripGreetingPrefix(content.trim()).toLowerCase();
  // Scenario setup: "настрой/подготовь пк/компьютер под/для X"
  if (/подготов/.test(text) && /(пк|компьютер|рабоч|работ|место)/.test(text)) return true;
  if (/настрой/.test(text) && /(компьютер|пк|рабоч|работ|место|вайб|игр|отдых|учёб|развлеч)/.test(text)) return true;
  // Short follow-up scenario switches: "а теперь для игр", "под вайб", "для работы"
  if (/^а теперь (для|под)\b/i.test(text)) return true;
  if (/^(теперь|давай|сделай) (для|под)\b/i.test(text)) return true;
  if (/^(для|под) (игр|вайба?|отдыха|учёбы|развлечени|релакс)/i.test(text)) return true;
  // Other scenario phrases
  if (/(начн|начнём|начнем)/.test(text) && /(рабоч|работ|день)/.test(text)) return true;
  if (/запусти.{0,5}(всё|все) нужное/i.test(text)) return true;
  if (/prepare/.test(text) && /(pc|computer|workspace|work)/.test(text)) return true;
  if (/set up/.test(text) && /(workspace|pc|work)/.test(text)) return true;
  const actionCount = (text.match(/\b(открой|запусти|включи|поставь|зайди|open|launch|play|start)\b/gi) || []).length;
  return actionCount >= 2;
}

export async function buildAgentPlan(
  userMessage: string,
  preferences: UserPreferences,
  model: string,
  installedApps: string[] = [],
  fileRoots: string[] = [],
): Promise<AgentPlan | null> {
  const appsHint = installedApps.length > 0
    ? `Installed apps on this PC (use ONLY these for open_app):\n${installedApps.join(', ')}`
    : 'Installed apps: unknown (use open_app only for commonly installed apps)';

  const fileRootsHint = fileRoots.length > 0
    ? `Accessible directories for file operations:\n${fileRoots.join('\n')}\nWhen user asks to find/open/read a file without specifying a path, use list_files on these directories first.`
    : `Accessible directories: Desktop, Documents, D:\\projects\\eidon`;

  const systemPrompt = [
    'You are a request router for Eidon, a Windows AI assistant.',
    'Decide if the user\'s request requires calling tools on the computer.',
    'Return ONLY valid JSON — no markdown, no explanation.',
    '',
    'Available tools:',
    EIDON_TOOLS_DESC,
    '',
    appsHint,
    '',
    fileRootsHint,
    '',
    '--- USER MEMORY & PREFERENCES ---',
    `Work apps: ${preferences.work_apps.join(', ') || 'none saved'}`,
    `Music genres: ${preferences.music.genres.join(', ') || 'none saved'}`,
    `Music artists: ${preferences.music.artists.join(', ') || 'none saved'}`,
    Object.keys(preferences.custom || {}).length > 0
      ? `Custom: ${JSON.stringify(preferences.custom)}`
      : '',
    '--- END MEMORY ---',
    '',
    'If tools are needed, return:',
    '{"steps":[{"mode":"parallel","actions":[{"tool":"open_app","name":"VS Code"}]}],"summary":"Краткое описание на русском"}',
    '',
    'Return {"steps":[],"summary":""} ONLY for pure conversation or general knowledge questions',
    '(history, science, advice, etc.) that do NOT require reading the PC state.',
    '',
    'Rules:',
    '- Use "parallel" when actions can run simultaneously, "sequential" when order matters',
    '- Use open_work_apps ONLY when user literally says "рабочие программы"/"work apps"',
    '- ALWAYS use list_installed_apps when user asks what apps/programs are installed/downloaded on the PC (скачаны, установлены, есть на компьютере)',
    '- ALWAYS use list_running_processes when user asks what is currently running/open on the PC (запущено, открыто, работает)',
    '- ALWAYS use set_reminder when user asks to set a timer or reminder (напомни, поставь таймер, через N минут/часов, remind me). Convert time to delay_seconds (e.g. 7 минут = 420, 1 час = 3600). The text field is what to remind about.',
    '- Choose apps from context/mood: вайб → Spotify/Discord, игры → Steam/Discord, работа → VS Code/Figma, праздник → Spotify/браузер',
    '- For play_youtube: write a query matching the mood. Use saved preferences if they fit; adapt them otherwise (rock → "rock party mix" for праздник, "gaming rock" for игры)',
    '- NEVER copy the user\'s message as a play_youtube query',
    '- Use user preferences (saved work apps, music genres, artists) to make decisions — if the user has saved work apps, open them for work setup; if the user has saved music genres/artists, include play_youtube with their taste when context is about setting up environment, mood, or work session',
    '- For music query: use saved genres/artists as the base, adapt to the mood (e.g. rock → "rock focus playlist" for work, "rock gaming mix" for gaming)',
    '- Add play_youtube only if music is relevant to the context (setup, mood, vibe, explicit request) — do not add it for purely functional requests (open app, set reminder, search)',
    '- ALWAYS use save_preference when user says запомни/remember/запиши/note that/сохрани. Choose category: "music_artist" for band/singer names, "music_genre" for genres, "work_app" for apps, "note" for anything else. Value = the exact thing to remember.',
    '- ALWAYS use web_search when user asks for current news, latest info, internet search, recent events, weather, prices, or any real-time data (поищи, найди в интернете, последние новости, что нового, загугли, что сейчас, search the web)',
    '- ALWAYS use find_and_open_file when user says open/find MY document/file without specifying exact path (открой мою курсовую, открой мой диплом, открой мой отчёт, найди мой файл, open my report, find my thesis). Use a short descriptive query like "курсовая", "диплом", "отчёт".',
    '- ALWAYS use read_file when user asks to READ/SHOW the CONTENTS of a specific file with an exact path (прочитай файл X, покажи содержимое X, что в файле X). Use the exact path the user specified.',
    '- ALWAYS use list_files when user asks what files are in a folder/directory (какие файлы, что в папке, список файлов в X)',
    '- ALWAYS use write_file when user asks to save, create, or write content to a file (сохрани в файл, запиши в файл, создай файл). Use path from context or ask user.',
    '- Summary must be 1 short sentence in Russian',
  ].join('\n');

  try {
    const result = await fetchChatCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 600,
    });
    const raw = (result?.choices?.[0]?.message?.content || '').trim();
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const plan = JSON.parse(jsonStr) as AgentPlan;
    if (!Array.isArray(plan.steps) || plan.steps.length === 0) return null;
    return plan;
  } catch (err) {
    console.warn('[buildAgentPlan] failed:', err);
    return null;
  }
}

export function isWorkAppsIntent(content: string): boolean {
  const text = stripGreetingPrefix(content.trim()).toLowerCase();
  return (
    /открой.*(программы для работы|приложения для работы|рабочие программы|рабочие приложения|work apps|apps for work)/i.test(text) ||
    /запусти.*(программы для работы|приложения для работы|рабочие программы|рабочие приложения)/i.test(text) ||
    /open.*(work apps|apps for work|working apps)/i.test(text)
  );
}

export function isSavePreferenceIntent(content: string): boolean {
  const text = content.trim().toLowerCase();
  return (
    /запомни.*(работ|программ|приложен|музык|жанр|слушаю|групп|исполнитель|артист|певц)/i.test(text) ||
    /для работы.*(использую|открываю|нужн)/i.test(text) ||
    /я (обычно |часто )?(слушаю|люблю).*(музык|рок|джаз|поп|метал|хип|реп|классик|групп)/i.test(text) ||
    /моя любимая (группа|музыка|группа|исполнитель)/i.test(text) ||
    /мой любимый (исполнитель|артист)/i.test(text) ||
    /remember.*(work|app|music|genre|listen|band|artist)/i.test(text)
  );
}

export async function generateProjectFromPrompt(prompt: string, model: string): Promise<{
  ok: boolean;
  project_name: string;
  opened_path: string;
  files: string[];
}> {
  const res = await fetch(`${getBase()}/v1/projects/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || `Project generation failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchChatCompletion(request: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
}): Promise<any> {
  if (isTauri()) {
    try {
      return await tauriInvoke('chat_completion', { request: { ...request, stream: false } });
    } catch (e: any) {
      throw new Error(e?.message || e || 'Chat request failed');
    }
  }
  const res = await fetch(`${getBase()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, stream: false }),
  });
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  if (isTauri()) {
    try {
      await tauriInvoke('check_health', { apiUrl: getBase() });
      return true;
    } catch {
      return false;
    }
  }
  try {
    const res = await fetch(`${getBase()}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchEnergy(): Promise<unknown> {
  if (isTauri()) {
    try {
      return await tauriInvoke('fetch_energy', { apiUrl: getBase() });
    } catch {}
  }
  const res = await fetch(`${getBase()}/v1/telemetry/energy`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function fetchTelemetry(): Promise<unknown> {
  if (isTauri()) {
    try {
      return await tauriInvoke('fetch_telemetry', { apiUrl: getBase() });
    } catch {}
  }
  const res = await fetch(`${getBase()}/v1/telemetry/stats`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function fetchTraces(limit: number = 50): Promise<unknown> {
  if (isTauri()) {
    try {
      return await tauriInvoke('fetch_traces', { apiUrl: getBase(), limit });
    } catch {}
  }
  const res = await fetch(`${getBase()}/v1/traces?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Speech
// ---------------------------------------------------------------------------

export interface TranscriptionResult {
  text: string;
  language: string | null;
  confidence: number | null;
  duration_seconds: number;
}

export interface SpeechHealth {
  available: boolean;
  backend?: string;
  reason?: string;
}

export async function transcribeAudio(audioBlob: Blob, filename = 'recording.webm'): Promise<TranscriptionResult> {
  if (isTauri()) {
    try {
      const buffer = await audioBlob.arrayBuffer();
      return await tauriInvoke<TranscriptionResult>('transcribe_audio', {
        audioData: Array.from(new Uint8Array(buffer)),
        filename,
      });
    } catch {
      // Fall through to fetch
    }
  }
  const formData = new FormData();
  formData.append('file', audioBlob, filename);
  const res = await fetch(`${getBase()}/v1/speech/transcribe`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
  return res.json();
}

export async function fetchSpeechHealth(): Promise<SpeechHealth> {
  if (isTauri()) {
    try {
      return await tauriInvoke<SpeechHealth>('speech_health');
    } catch {
      // Fall through to HTTP health check.
    }
  }
  try {
    const res = await fetch(`${getBase()}/v1/speech/health`);
    if (!res.ok) return { available: false };
    return res.json();
  } catch {
    return { available: false };
  }
}

export interface ReminderAlert {
  id: string;
  text: string;
  due_at: string;
  status: string;
  created_at: string;
  triggered_at?: string | null;
  alert_pending: boolean;
}

export async function fetchReminderAlerts(): Promise<ReminderAlert[]> {
  const res = await fetch(`${getBase()}/v1/reminders/alerts`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.alerts || [];
}

export async function acknowledgeReminder(reminderId: string): Promise<void> {
  const res = await fetch(`${getBase()}/v1/reminders/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reminder_id: reminderId }),
  });
  if (!res.ok) throw new Error(`Reminder acknowledge failed: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Agent Manager
// ---------------------------------------------------------------------------

export interface ManagedAgent {
  id: string;
  name: string;
  agent_type: string;
  config: Record<string, unknown>;
  status: 'idle' | 'running' | 'paused' | 'error' | 'archived' | 'needs_attention' | 'budget_exceeded' | 'stalled';
  summary_memory: string;
  created_at: number;
  updated_at: number;
  // Runtime stats
  total_runs?: number;
  total_cost?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  last_run_at?: number | null;
  // Schedule
  schedule_type?: string;
  schedule_value?: string;
  // Budget
  budget?: number;
  // Learning
  learning_enabled?: boolean;
  // Live progress
  current_activity?: string;
}

export interface AgentTask {
  id: string;
  agent_id: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress: Record<string, unknown>;
  findings: unknown[];
  created_at: number;
}

export interface ChannelBinding {
  id: string;
  agent_id: string;
  channel_type: string;
  config: Record<string, unknown>;
  session_id: string;
  routing_mode: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  source: 'built-in' | 'user';
  agent_type: string;
  [key: string]: unknown;
}

export interface AgentMessage {
  id: string;
  agent_id: string;
  direction: 'user_to_agent' | 'agent_to_user';
  content: string;
  mode: 'immediate' | 'queued';
  status: 'pending' | 'delivered' | 'responded';
  created_at: number;
}

export async function fetchManagedAgents(): Promise<ManagedAgent[]> {
  const data = await apiJsonRequest<{ agents?: ManagedAgent[] }>('GET', '/v1/managed-agents');
  return data.agents || [];
}

export async function fetchManagedAgent(agentId: string): Promise<ManagedAgent> {
  return apiJsonRequest<ManagedAgent>('GET', `/v1/managed-agents/${agentId}`);
}

export async function createManagedAgent(body: {
  name: string;
  agent_type?: string;
  template_id?: string;
  config?: Record<string, unknown>;
}): Promise<ManagedAgent> {
  return apiJsonRequest<ManagedAgent>('POST', '/v1/managed-agents', body);
}

const DESKTOP_CHAT_AGENT_NAME = 'Desktop Chat Agent';

const DESKTOP_AGENT_PROMPT = [
  'You are Eidon, an AI assistant running on the user\'s Windows PC.',
  'You have real access to tools on this machine.',
  'Use browser tools for websites, web apps, YouTube, music, and reading page content.',
  'Use web_search for real-time facts, current information, or when the user explicitly asks to google, find, look up, or search before opening something.',
  'Use shell_exec for launching installed applications, checking installed software, opening local files, and safe system commands.',
  'Use file_read/file_write/apply_patch only for file tasks inside explicitly relevant workspaces.',
  'Use save_markdown_note, list_markdown_notes, and read_markdown_note for personal notes in the Eidon markdown folder.',
  'Use set_reminder, list_reminders, and cancel_reminder for timers and spoken reminders.',
  'Use create_project_file, list_project_files, read_project_file, and open_project_file for code projects in the exact folder D:\\projects\\Eidon\\His-projects.',
  'When asked to create a project or write code, save the result into D:\\projects\\Eidon\\His-projects under a clear project folder name.',
  'When asked to open a project file, use open_project_file and never invent another filesystem path such as C:\\Users\\Public\\Eidon.',
  'Supported project file types are html, css, js, py, and ts.',
  'Do not claim that you cannot access the computer when browser, shell, or file tools can solve the task.',
  'For safe actions, act immediately.',
  'For dangerous actions, do not execute immediately. Ask for confirmation first.',
  'Dangerous actions include deleting or moving files, changing system settings, installing software, registry edits, git/apply_patch outside the requested workspace, or anything destructive.',
  'Full desktop-wide mouse and keyboard automation outside the browser is not available in this build. State that clearly if needed.',
  'When the user asks to open a site or service, choose the canonical URL and open it in the visible browser.',
  'When the user asks to play random YouTube video, open YouTube with a safe search or watch page and let the visible browser show it.',
  'When the user asks to play music, prefer YouTube Music if reachable, otherwise YouTube search for the requested or generic music query.',
  'When the user asks to research a topic and then open a video, first use web_search, then open a relevant YouTube result in the visible browser.',
  'When the user asks to summarize an opened site, open it first if needed, then extract page content and return a concise summary.',
].join(' ');

function buildDesktopAgentConfig(model: string): Record<string, unknown> {
  return {
    instruction: DESKTOP_AGENT_PROMPT,
    tools: [
      'browser',
      'browser_navigate',
      'browser_open_youtube_first_result',
      'browser_click',
      'browser_type',
      'browser_screenshot',
      'browser_extract',
      'browser_axtree',
      'web_search',
      'shell_exec',
      'file_read',
      'file_write',
      'apply_patch',
      'save_markdown_note',
      'list_markdown_notes',
      'read_markdown_note',
      'set_reminder',
      'list_reminders',
      'cancel_reminder',
      'create_project_file',
      'list_project_files',
      'read_project_file',
      'open_project_file',
    ],
    model,
    max_turns: 6,
    temperature: 0.2,
  };
}

export function routeDesktopIntentStrict(content: string): string {
  const text = content.trim();
  const youtubeMediaIntent =
    /(youtube|ютуб)/i.test(text) &&
    /(play|turn on|put on|song|music|track|video|включи|поставь|песн|трек|музык|видео)/i.test(text);
  const randomYoutubeIntent =
    /(youtube|ютуб)/i.test(text) &&
    /(random|случайн)/i.test(text) &&
    /(video|видео)/i.test(text);
  const genericMusicIntent = /(play music|open music|включи музыку)/i.test(text);

  if (youtubeMediaIntent) {
    const query = encodeURIComponent(text.replace(/\s+/g, ' ').trim());
    return `Open exactly this URL in the visible browser and stop after it loads: https://www.youtube.com/results?search_query=${query}\n\nImportant: do not open extra browser windows, extra tabs, or reformulated searches. Do not keep browsing after the first successful page load. Reply with a short confirmation and the page title.`;
  }

  if (randomYoutubeIntent) {
    return 'Open exactly one YouTube search or watch URL in the visible browser for a safe random or trending video. Do not open extra windows, tabs, or alternate searches. Reply with a short confirmation and the page title.';
  }

  if (genericMusicIntent) {
    return 'Open exactly one YouTube Music or YouTube music search URL in the visible browser. Do not open extra windows, tabs, or alternate searches. Reply with a short confirmation and the page title.';
  }

  return routeDesktopIntent(content);
}

export function routeDesktopIntentFinal(content: string): string {
  const text = content.trim();
  const lower = text.toLowerCase();
  const actionableIntent =
    /^(open|start|play|turn on|put on|launch|click)\b/i.test(text) ||
    lower.startsWith('\u043e\u0442\u043a\u0440\u043e\u0439') ||
    lower.startsWith('\u0432\u043a\u043b\u044e\u0447\u0438') ||
    lower.startsWith('\u043f\u043e\u0441\u0442\u0430\u0432\u044c') ||
    lower.startsWith('\u0437\u0430\u043f\u0443\u0441\u0442\u0438') ||
    lower.startsWith('\u043d\u0430\u0436\u043c\u0438');
  const genericPlaybackIntent =
    (
      /^(start|play|turn on|put on|launch)\b/i.test(text) ||
      lower.startsWith('\u0432\u043a\u043b\u044e\u0447\u0438') ||
      lower.startsWith('\u043f\u043e\u0441\u0442\u0430\u0432\u044c') ||
      lower.startsWith('\u0437\u0430\u043f\u0443\u0441\u0442\u0438')
    ) &&
    !/(https?:\/\/|www\.)/i.test(text);
  const projectCreateIntent =
    (lower.includes('\u0441\u043e\u0437\u0434\u0430\u0439') || lower.includes('create')) &&
    (lower.includes('\u043f\u0440\u043e\u0435\u043a\u0442') || lower.includes('project'));
  const projectOpenIntent =
    (lower.includes('\u043e\u0442\u043a\u0440\u043e\u0439') || lower.includes('open')) &&
    (
      lower.includes('\u043f\u0440\u043e\u0435\u043a\u0442') ||
      lower.includes('project') ||
      lower.includes('index.html') ||
      lower.includes('.html') ||
      lower.includes('.css') ||
      lower.includes('.js') ||
      lower.includes('.ts') ||
      lower.includes('.py')
    );

  if (projectCreateIntent) {
    return `${text}

Important: this is a code project request for the exact folder D:\\projects\\Eidon\\His-projects.
You must use create_project_file for every file you create.
If the user asked to open the project, then after creation you must use open_project_file for the main entry file, usually index.html.
Do not only describe the project. Actually create the files with tools first.
Reply briefly with the real created filenames and the real opened path.`;
  }

  if (projectOpenIntent) {
    return `${text}

Important: if this refers to a Eidon-created code project, use list_project_files, read_project_file, and open_project_file in the exact folder D:\\projects\\Eidon\\His-projects.
Never invent any path such as C:\\Users\\Public\\Eidon.
Reply briefly with the real opened path.`;
  }

  if (genericPlaybackIntent) {
    const query = normalizePlaybackQuery(text);
    return `Use browser_open_youtube_first_result with query ${JSON.stringify(query)}. This is a media playback request, so open the first regular YouTube video result directly instead of stopping on the search page. Reply with a short confirmation and the final page title.`;
  }

  const strict = routeDesktopIntentStrict(content);
  if (strict !== content) return strict;
  if (actionableIntent) {
    return `${text}

Important: this is a desktop action request. Use browser tools or shell_exec if possible. Do not answer that you lack access to the computer when the available tools can perform the action.`;
  }
  return content;
}

export function routeDesktopIntent(content: string): string {
  const text = content.trim();
  const lower = text.toLowerCase();

  const summarizeSite =
    lower.includes('РёР·Р»РѕР¶Рё') ||
    lower.includes('СЃСѓРјРј') ||
    lower.includes('РїРµСЂРµСЃРєР°Р¶') ||
    lower.includes('summarize') ||
    lower.includes('summary');

  if (lower === 'open youtube' || lower === 'РѕС‚РєСЂРѕР№ youtube' || lower === 'РѕС‚РєСЂРѕР№ СЋС‚СѓР±') {
    return 'Open https://www.youtube.com in the visible browser and reply with a short confirmation.';
  }

  if (
    lower.includes('СЃР»СѓС‡Р°Р№РЅ') &&
    (lower.includes('СЋС‚СѓР±') || lower.includes('youtube')) &&
    (lower.includes('РІРёРґРµРѕ') || lower.includes('video'))
  ) {
    return 'Open YouTube in the visible browser and start a safe random video or a general trending/random video search result. Reply with a short confirmation and the page title.';
  }

  if (
    lower.includes('РІРєР»СЋС‡Рё РјСѓР·С‹РєСѓ') ||
    lower.includes('play music') ||
    lower.includes('open music')
  ) {
    return 'Open YouTube Music in the visible browser if possible, otherwise open YouTube music search in the visible browser. Reply with a short confirmation and the page title.';
  }

  if (summarizeSite && /(https?:\/\/|www\.|example\.com|\.ru|\.com|\.org|\.io)/i.test(text)) {
    return `${text}\n\nImportant: if the site is not already open, open it in the visible browser first, then extract the page content and return a concise summary in Russian.`;
  }

  if (lower.includes('РѕС‚РєСЂРѕР№ Р±СЂР°СѓР·РµСЂ') || lower.includes('open browser')) {
    return `${text}\n\nImportant: use shell_exec to find and launch an installed browser application on Windows.`;
  }

  if (lower.includes('РѕС‚РєСЂРѕР№ ') || lower.includes('open ')) {
    return `${text}\n\nImportant: if this refers to a website or online service, use browser tools and open it in the visible browser. If this refers to a local Windows application, use shell_exec.`;
  }

  return text;
}

export async function ensureDesktopChatAgent(model: string): Promise<ManagedAgent> {
  const agents = await fetchManagedAgents();
  const matchingAgents = agents.filter((agent) => agent.name === DESKTOP_CHAT_AGENT_NAME);
  const config = buildDesktopAgentConfig(model);

  for (const agent of matchingAgents) {
    if (agent.status === 'idle' || agent.status === 'paused') {
      const currentConfig = JSON.stringify(agent.config || {});
      const nextConfig = JSON.stringify(config);
      if (currentConfig !== nextConfig) {
        return updateManagedAgent(agent.id, { config });
      }
      return agent;
    }
  }

  for (const agent of matchingAgents) {
    if (agent.status !== 'idle' && agent.status !== 'paused') {
      await deleteManagedAgent(agent.id).catch(() => {});
    }
  }

  return createManagedAgent({
    name: DESKTOP_CHAT_AGENT_NAME,
    agent_type: 'operative',
    config,
  });
}

export async function updateManagedAgent(
  agentId: string,
  body: Partial<{ name: string; agent_type: string; config: Record<string, unknown> }>,
): Promise<ManagedAgent> {
  return apiJsonRequest<ManagedAgent>('PATCH', `/v1/managed-agents/${agentId}`, body);
}

export async function deleteManagedAgent(agentId: string): Promise<void> {
  await apiJsonRequest<Record<string, never>>('DELETE', `/v1/managed-agents/${agentId}`);
}

export async function pauseManagedAgent(agentId: string): Promise<void> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/pause`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export async function resumeManagedAgent(agentId: string): Promise<void> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/resume`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export async function fetchAgentTasks(agentId: string): Promise<AgentTask[]> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/tasks`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.tasks || [];
}

export async function createAgentTask(agentId: string, description: string): Promise<AgentTask> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function fetchAgentChannels(agentId: string): Promise<ChannelBinding[]> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/channels`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.bindings || [];
}

export async function bindAgentChannel(
  agentId: string,
  channelType: string,
  config?: Record<string, unknown>,
): Promise<ChannelBinding> {
  const res = await fetch(
    `${getBase()}/v1/managed-agents/${agentId}/channels`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_type: channelType,
        config: config || {},
        routing_mode: 'dedicated',
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function unbindAgentChannel(
  agentId: string,
  bindingId: string,
): Promise<void> {
  const res = await fetch(
    `${getBase()}/v1/managed-agents/${agentId}/channels/${bindingId}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

// -- SendBlue auto-setup helpers ------------------------------------------

export async function sendblueVerify(
  apiKeyId: string,
  apiSecretKey: string,
): Promise<{ valid: boolean; numbers: string[]; raw: unknown }> {
  const res = await fetch(`${getBase()}/v1/channels/sendblue/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key_id: apiKeyId, api_secret_key: apiSecretKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Verification failed: ${res.status}`);
  }
  return res.json();
}

export async function sendblueRegisterWebhook(
  apiKeyId: string,
  apiSecretKey: string,
  webhookUrl: string,
): Promise<{ registered: boolean; status: number }> {
  const res = await fetch(`${getBase()}/v1/channels/sendblue/register-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key_id: apiKeyId,
      api_secret_key: apiSecretKey,
      webhook_url: webhookUrl,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Webhook registration failed: ${res.status}`);
  }
  return res.json();
}

export async function sendblueTest(
  apiKeyId: string,
  apiSecretKey: string,
  fromNumber: string,
  toNumber: string,
): Promise<{ sent: boolean; status: number }> {
  const res = await fetch(`${getBase()}/v1/channels/sendblue/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key_id: apiKeyId,
      api_secret_key: apiSecretKey,
      from_number: fromNumber,
      to_number: toNumber,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Test message failed: ${res.status}`);
  }
  return res.json();
}

export async function sendblueHealth(): Promise<{ channel_connected: boolean; bridge_wired: boolean; ready: boolean }> {
  const res = await fetch(`${getBase()}/v1/channels/sendblue/health`);
  if (!res.ok) return { channel_connected: false, bridge_wired: false, ready: false };
  return res.json();
}

export async function fetchTemplates(): Promise<AgentTemplate[]> {
  const res = await fetch(`${getBase()}/v1/templates`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.templates || [];
}

export async function runManagedAgent(agentId: string): Promise<void> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/run`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Failed: ${res.status}`);
  }
}

export async function recoverManagedAgent(agentId: string): Promise<{ recovered: boolean; checkpoint: unknown }> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/recover`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAgentState(agentId: string): Promise<{
  agent: ManagedAgent;
  tasks: AgentTask[];
  channels: ChannelBinding[];
  messages: AgentMessage[];
  checkpoint: unknown;
}> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/state`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function sendAgentMessage(
  agentId: string,
  content: string,
  mode: 'immediate' | 'queued' = 'queued',
  callbacks?: {
    onProgress?: (label: string) => void;
    onContentDelta?: (delta: string, fullContent: string) => void;
    onDone?: (fullContent: string, usage?: Record<string, number>, telemetry?: Record<string, unknown>) => void;
  },
): Promise<AgentMessage> {
  if (isTauri()) {
    return apiJsonRequest<AgentMessage>('POST', `/v1/managed-agents/${agentId}/messages`, {
      content,
      mode,
      stream: false,
    });
  }

  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, mode, stream: true }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);

  // If streaming, consume the SSE response so the agent runs
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream') && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    let lastUsage: Record<string, number> | undefined;
    let lastTelemetry: Record<string, unknown> | undefined;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const chunk = JSON.parse(line.slice(6));
            // Check for tool progress events
            const toolProgress = chunk.choices?.[0]?.tool_progress;
            if (toolProgress) {
              callbacks?.onProgress?.(toolProgress);
            }
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              callbacks?.onContentDelta?.(delta, fullContent);
            }
            // Capture usage + telemetry from final chunk
            if (chunk.usage) lastUsage = chunk.usage;
            if (chunk.telemetry) lastTelemetry = chunk.telemetry;
          } catch { /* skip malformed chunks */ }
        }
      }
    } catch { /* stream ended */ }

    callbacks?.onDone?.(fullContent, lastUsage, lastTelemetry);

    return {
      id: '',
      agent_id: agentId,
      direction: 'agent_to_user',
      content: fullContent,
      mode,
      status: 'delivered',
      created_at: Date.now() / 1000,
    };
  }

  return res.json();
}

export async function sendAgentMessageImmediate(
  agentId: string,
  content: string,
  mode: 'immediate' | 'queued' = 'immediate',
  timeoutMs = 120000,
): Promise<AgentMessage> {
  const startedAt = Date.now() / 1000;
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, mode, stream: false }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await fetchAgentMessages(agentId);
    const reply = messages.find(
      (msg) =>
        msg.direction === 'agent_to_user' &&
        msg.created_at >= startedAt &&
        !!msg.content?.trim(),
    );
    if (reply) return reply;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error('Timed out waiting for agent response');
}

export async function fetchAgentMessages(agentId: string): Promise<AgentMessage[]> {
  const data = await apiJsonRequest<{ messages?: AgentMessage[] }>('GET', `/v1/managed-agents/${agentId}/messages`);
  return data.messages || [];
}

export async function fetchErrorAgents(): Promise<ManagedAgent[]> {
  const res = await fetch(`${getBase()}/v1/agents/errors`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.agents || [];
}

// ---------------------------------------------------------------------------
// Agent Learning + Traces
// ---------------------------------------------------------------------------

export interface LearningLogEntry {
  id: string;
  agent_id: string;
  event_type: string;
  description: string;
  data: Record<string, unknown>;
  created_at: number;
}

export interface AgentTrace {
  id: string;
  outcome: string;
  duration: number;
  started_at: number;
  steps: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolInfo {
  name: string;
  description: string;
  category: string;
  source: 'tool' | 'channel';
  requires_credentials: boolean;
  credential_keys: string[];
  configured: boolean;
}

export async function fetchAvailableTools(): Promise<ToolInfo[]> {
  const res = await fetch(`${getBase()}/v1/tools`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.tools || [];
}

export async function saveToolCredentials(
  toolName: string,
  credentials: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${getBase()}/v1/tools/${toolName}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export interface AgentTraceDetail {
  id: string;
  agent: string;
  outcome: string;
  duration: number;
  started_at: number;
  steps: Array<{
    step_type: string;
    input: unknown;
    output: string;
    duration: number;
    metadata: Record<string, unknown>;
  }>;
}

export async function fetchLearningLog(agentId: string): Promise<LearningLogEntry[]> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/learning`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.learning_log || [];
}

export async function triggerLearning(agentId: string): Promise<void> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/learning/run`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export async function fetchAgentTraces(agentId: string, limit = 20): Promise<AgentTrace[]> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/traces?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.traces || [];
}

export async function fetchAgentTrace(agentId: string, traceId: string): Promise<AgentTraceDetail> {
  const res = await fetch(`${getBase()}/v1/managed-agents/${agentId}/traces/${traceId}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Leaderboard savings submission (Supabase)
// ---------------------------------------------------------------------------

export interface SavingsSubmission {
  anon_id: string;
  display_name: string;
  email: string;
  total_calls: number;
  total_tokens: number;
  dollar_savings: number;
  energy_wh_saved: number;
  flops_saved: number;
  token_counting_version?: number;
}

export async function submitSavings(data: SavingsSubmission): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/savings_entries?on_conflict=anon_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(data),
      },
    );
    return res.ok || res.status === 201 || res.status === 200;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// OpenCode coding agent (/v1/code/*)
// ---------------------------------------------------------------------------

export interface CodeSessionState {
  session_id: string;
  status: Record<string, unknown>;
  reply: string;
  tool_activity: { tool: string; status: string; title: string }[];
  pending_permissions: Record<string, unknown>[];
  diff: { file?: string }[] | unknown;
}

export async function codeHealth(): Promise<{ installed: boolean; running: boolean }> {
  return apiJsonRequest('GET', '/v1/code/health');
}

export async function runCodeTask(
  task: string,
  directory: string,
  model?: string,
  sessionId?: string,
): Promise<{ ok: boolean; session_id: string; directory: string }> {
  return apiJsonRequest('POST', '/v1/code/task', {
    task,
    directory,
    model: model || '',
    session_id: sessionId || '',
  });
}

export async function getCodeSession(sessionId: string): Promise<CodeSessionState> {
  return apiJsonRequest('GET', `/v1/code/sessions/${encodeURIComponent(sessionId)}`);
}

export async function respondCodePermission(
  sessionId: string,
  permissionId: string,
  response: 'once' | 'always' | 'reject',
): Promise<void> {
  await apiJsonRequest('POST', '/v1/code/permission', {
    session_id: sessionId,
    permission_id: permissionId,
    response,
  });
}

export async function abortCodeSession(sessionId: string): Promise<void> {
  await apiJsonRequest('POST', `/v1/code/sessions/${encodeURIComponent(sessionId)}/abort`);
}

// ---------------------------------------------------------------------------
// Structured memory facts (/v1/memory/facts)
// ---------------------------------------------------------------------------

export interface MemoryFact {
  id: string;
  kind: 'person' | 'project' | 'preference';
  name: string;
  detail: string;
  tags: string[];
  created_at: number;
  updated_at: number;
}

export interface MemoryFactCounts {
  person: number;
  project: number;
  preference: number;
}

export async function listMemoryFacts(
  kind?: string,
  query?: string,
): Promise<{ facts: MemoryFact[]; counts: MemoryFactCounts }> {
  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  if (query) params.set('query', query);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiJsonRequest('GET', `/v1/memory/facts${suffix}`);
}

export async function getMemoryFactCounts(): Promise<MemoryFactCounts> {
  return apiJsonRequest('GET', '/v1/memory/facts/counts');
}

export async function saveMemoryFact(
  kind: string,
  name: string,
  detail = '',
): Promise<MemoryFact> {
  return apiJsonRequest('POST', '/v1/memory/facts', { kind, name, detail, tags: [] });
}

export async function deleteMemoryFact(factId: string): Promise<void> {
  await apiJsonRequest('DELETE', `/v1/memory/facts/${encodeURIComponent(factId)}`);
}
