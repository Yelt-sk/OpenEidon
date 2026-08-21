import { create } from 'zustand';
import type {
  Conversation,
  ChatMessage,
  LogEntry,
  ModelInfo,
  MessageTelemetry,
  SavingsData,
  ServerInfo,
  StreamState,
  ToolCallInfo,
  TokenUsage,
} from '../types';
import type { ManagedAgent } from './api';

export interface AgentEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  time: string;
  regularity: 'once' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
  weekdays: number[];
  tools: string[];
  instructions: string;
  autonomy: 1 | 2 | 3 | 4;
  lastRun?: number;
  enabled: boolean;
}

// ── localStorage persistence ──────────────────────────────────────────

const CONVERSATIONS_KEY = 'openeidon-conversations';
const WORKFLOWS_KEY = 'openeidon-workflows';
const SETTINGS_KEY = 'openeidon-settings';
const DESKTOP_SPEECH_BOOTSTRAP_KEY = 'openeidon-desktop-speech-bootstrap-v1';
const OPTIN_KEY = 'openeidon-optin';
const OPTIN_NAME_KEY = 'openeidon-display-name';
const OPTIN_EMAIL_KEY = 'openeidon-email';
const OPTIN_ANONID_KEY = 'openeidon-anon-id';
const OPTIN_SEEN_KEY = 'openeidon-optin-seen';
const WINDOW_SYNC_CHANNEL = 'openeidon-window-sync';
const WINDOW_ID = Math.random().toString(36).slice(2, 10);
let syncChannel: BroadcastChannel | null = null;
let applyingRemoteState = false;

interface ConversationStore {
  version: 1;
  conversations: Record<string, Conversation>;
  activeId: string | null;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadConversations(): ConversationStore {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return { version: 1, conversations: {}, activeId: null };
    const parsed = JSON.parse(raw);
    if (parsed.version === 1) return parsed;
    return { version: 1, conversations: {}, activeId: null };
  } catch {
    return { version: 1, conversations: {}, activeId: null };
  }
}

function saveConversations(store: ConversationStore): void {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(store));
}

export type ThemeMode = 'light' | 'dark' | 'system';

interface Settings {
  theme: ThemeMode;
  apiUrl: string;
  fontSize: 'small' | 'default' | 'large';
  defaultModel: string;
  defaultAgent: string;
  temperature: number;
  maxTokens: number;
  speechEnabled: boolean;
  speechAutoSend: boolean;
  speechOutputEnabled: boolean;
  pushToTalkEnabled: boolean;
}

function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

function loadSettings(): Settings {
  const defaults: Settings = {
    theme: 'system',
    apiUrl: '',
    fontSize: 'default',
    defaultModel: '',
    defaultAgent: '',
    temperature: 0.7,
    maxTokens: 4096,
    speechEnabled: false,
    speechAutoSend: true,
    speechOutputEnabled: false,
    pushToTalkEnabled: true,
  };
  const desktopDefaults: Partial<Settings> = isDesktopRuntime()
    ? {
        speechEnabled: true,
        speechAutoSend: true,
        speechOutputEnabled: true,
        pushToTalkEnabled: true,
      }
    : {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const initial = { ...defaults, ...desktopDefaults };
      if (isDesktopRuntime()) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(initial));
        localStorage.setItem(DESKTOP_SPEECH_BOOTSTRAP_KEY, 'true');
      }
      return initial;
    }
    const parsed = { ...defaults, ...JSON.parse(raw) };
    if (
      isDesktopRuntime() &&
      localStorage.getItem(DESKTOP_SPEECH_BOOTSTRAP_KEY) !== 'true'
    ) {
      const bootstrapped = {
        ...parsed,
        speechEnabled: true,
        speechAutoSend: true,
        speechOutputEnabled: true,
        pushToTalkEnabled: true,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(bootstrapped));
      localStorage.setItem(DESKTOP_SPEECH_BOOTSTRAP_KEY, 'true');
      return bootstrapped;
    }
    return parsed;
  } catch {
    return { ...defaults, ...desktopDefaults };
  }
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getSyncChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!syncChannel) syncChannel = new BroadcastChannel(WINDOW_SYNC_CHANNEL);
  return syncChannel;
}

function publishWindowState(payload: Record<string, unknown>): void {
  if (applyingRemoteState) return;
  getSyncChannel()?.postMessage({ source: WINDOW_ID, ...payload });
}

// ── Store ─────────────────────────────────────────────────────────────

const INITIAL_STREAM: StreamState = {
  isStreaming: false,
  phase: '',
  elapsedMs: 0,
  activeToolCalls: [],
  content: '',
  activityLog: [],
};

interface AppState {
  // Conversations
  conversations: Conversation[];
  activeId: string | null;
  messages: ChatMessage[];
  streamState: StreamState;

  // Models & server
  models: ModelInfo[];
  modelsLoading: boolean;
  selectedModel: string;
  serverInfo: ServerInfo | null;
  savings: SavingsData | null;

  // Settings
  settings: Settings;

  // Command palette
  commandPaletteOpen: boolean;

  // Sidebar
  sidebarOpen: boolean;

  // System panel
  systemPanelOpen: boolean;

  // Opt-in sharing
  optInEnabled: boolean;
  optInDisplayName: string;
  optInEmail: string;
  optInAnonId: string;
  optInModalSeen: boolean;
  optInModalOpen: boolean;

  // Actions: conversations
  loadConversations: () => void;
  createConversation: (model?: string) => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  loadMessages: (conversationId: string | null) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateLastAssistant: (
    conversationId: string,
    content: string,
    toolCalls?: ToolCallInfo[],
    usage?: TokenUsage,
    telemetry?: MessageTelemetry,
    audio?: { url: string },
  ) => void;
  setStreamState: (state: Partial<StreamState>) => void;
  resetStream: () => void;

  // Actions: models & server
  setModels: (models: ModelInfo[]) => void;
  setModelsLoading: (loading: boolean) => void;
  setSelectedModel: (model: string) => void;
  setServerInfo: (info: ServerInfo | null) => void;
  setSavings: (data: SavingsData | null) => void;

  // Actions: settings
  updateSettings: (partial: Partial<Settings>) => void;

  // Actions: UI
  setCommandPaletteOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSystemPanel: () => void;
  setSystemPanelOpen: (open: boolean) => void;

  // Agents
  managedAgents: ManagedAgent[];
  managedAgentsLoading: boolean;
  selectedAgentId: string | null;

  // Actions: agents
  setManagedAgents: (agents: ManagedAgent[]) => void;
  setManagedAgentsLoading: (loading: boolean) => void;
  setSelectedAgentId: (id: string | null) => void;

  // Agent events (live stream)
  agentEvents: AgentEvent[];
  addAgentEvent: (event: AgentEvent) => void;
  clearAgentEvents: () => void;

  // Actions: opt-in sharing
  setOptIn: (enabled: boolean, displayName: string, email: string) => void;
  setOptInModalOpen: (open: boolean) => void;
  markOptInModalSeen: () => void;

  // Logs
  logEntries: LogEntry[];
  addLogEntry: (entry: LogEntry) => void;
  clearLogs: () => void;

  // Model loading
  modelLoading: boolean;
  setModelLoading: (loading: boolean) => void;

  // Workflows
  workflows: Workflow[];
  addWorkflow: (w: Workflow) => void;
  deleteWorkflow: (id: string) => void;
  updateWorkflow: (id: string, patch: Partial<Workflow>) => void;
  markWorkflowRan: (id: string) => void;
  replaceWorkflows: (list: Workflow[]) => void;
}

export const useAppStore = create<AppState>((set, get) => {
  const initial = loadConversations();
  const convList = Object.values(initial.conversations).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  return {
    conversations: convList,
    activeId: initial.activeId,
    messages:
      initial.activeId && initial.conversations[initial.activeId]
        ? initial.conversations[initial.activeId].messages
        : [],
    streamState: INITIAL_STREAM,

    models: [],
    modelsLoading: true,
    selectedModel: '',
    serverInfo: null,
    savings: null,

    settings: loadSettings(),

    commandPaletteOpen: false,
    sidebarOpen: true,
    systemPanelOpen: true,

    optInEnabled: localStorage.getItem(OPTIN_KEY) === 'true',
    optInDisplayName: localStorage.getItem(OPTIN_NAME_KEY) || '',
    optInEmail: localStorage.getItem(OPTIN_EMAIL_KEY) || '',
    optInAnonId: localStorage.getItem(OPTIN_ANONID_KEY) || crypto.randomUUID(),
    optInModalSeen: localStorage.getItem(OPTIN_SEEN_KEY) === 'true',
    optInModalOpen: false,

    // ── Conversations ───────────────────────────────────────────────

    loadConversations: () => {
      const store = loadConversations();
      const nextState = {
        conversations: Object.values(store.conversations).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
        activeId: store.activeId,
      };
      set(nextState);
      publishWindowState({
        type: 'conversation-sync',
        ...nextState,
        messages: store.activeId && store.conversations[store.activeId]
          ? store.conversations[store.activeId].messages
          : [],
      });
    },

    createConversation: (model?: string) => {
      const store = loadConversations();
      const conv: Conversation = {
        id: generateId(),
        title: 'New chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: model || get().selectedModel || 'default',
        messages: [],
      };
      store.conversations[conv.id] = conv;
      store.activeId = conv.id;
      saveConversations(store);
      const nextState = {
        conversations: Object.values(store.conversations).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
        activeId: conv.id,
        messages: [],
      };
      set(nextState);
      publishWindowState({ type: 'conversation-sync', ...nextState });
      return conv.id;
    },

    selectConversation: (id: string) => {
      const store = loadConversations();
      store.activeId = id;
      saveConversations(store);
      const conv = store.conversations[id];
      const nextState = {
        activeId: id,
        messages: conv ? conv.messages : [],
      };
      set(nextState);
      publishWindowState({
        type: 'conversation-sync',
        conversations: Object.values(store.conversations).sort((a, b) => b.updatedAt - a.updatedAt),
        ...nextState,
      });
    },

    deleteConversation: (id: string) => {
      const store = loadConversations();
      delete store.conversations[id];
      if (store.activeId === id) {
        const remaining = Object.keys(store.conversations);
        store.activeId = remaining.length > 0 ? remaining[0] : null;
      }
      saveConversations(store);
      const convList = Object.values(store.conversations).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      const activeConv = store.activeId
        ? store.conversations[store.activeId]
        : null;
      const nextState = {
        conversations: convList,
        activeId: store.activeId,
        messages: activeConv ? activeConv.messages : [],
      };
      set(nextState);
      publishWindowState({ type: 'conversation-sync', ...nextState });
    },

    loadMessages: (conversationId: string | null) => {
      if (!conversationId) {
        set({ messages: [] });
        return;
      }
      const store = loadConversations();
      const conv = store.conversations[conversationId];
      const nextMessages = conv ? conv.messages : [];
      set({ messages: nextMessages });
      publishWindowState({
        type: 'conversation-sync',
        conversations: Object.values(store.conversations).sort((a, b) => b.updatedAt - a.updatedAt),
        activeId: store.activeId,
        messages: nextMessages,
      });
    },

    addMessage: (conversationId: string, message: ChatMessage) => {
      const store = loadConversations();
      const conv = store.conversations[conversationId];
      if (!conv) return;
      conv.messages.push(message);
      conv.updatedAt = Date.now();
      if (message.role === 'user' && conv.title === 'New chat') {
        conv.title =
          message.content.slice(0, 50) +
          (message.content.length > 50 ? '...' : '');
      }
      saveConversations(store);
      const nextState = {
        messages: [...conv.messages],
        conversations: Object.values(store.conversations).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
      };
      set(nextState);
      publishWindowState({
        type: 'conversation-sync',
        ...nextState,
        activeId: store.activeId,
      });
    },

    updateLastAssistant: (
      conversationId: string,
      content: string,
      toolCalls?: ToolCallInfo[],
      usage?: TokenUsage,
      telemetry?: MessageTelemetry,
      audio?: { url: string },
    ) => {
      const store = loadConversations();
      const conv = store.conversations[conversationId];
      if (!conv) return;
      const lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.content = content;
        if (toolCalls) lastMsg.toolCalls = toolCalls;
        if (usage) lastMsg.usage = usage;
        if (telemetry) lastMsg.telemetry = telemetry;
        if (audio) lastMsg.audio = audio;
        conv.updatedAt = Date.now();
        saveConversations(store);
        const nextMessages = [...conv.messages];
        set({ messages: nextMessages });
        publishWindowState({
          type: 'conversation-sync',
          conversations: Object.values(store.conversations).sort((a, b) => b.updatedAt - a.updatedAt),
          activeId: store.activeId,
          messages: nextMessages,
        });
      }
    },

    setStreamState: (partial: Partial<StreamState>) => {
      const nextState = { ...get().streamState, ...partial };
      set({ streamState: nextState });
      publishWindowState({ type: 'stream-sync', streamState: nextState });
    },

    resetStream: () => {
      set({ streamState: INITIAL_STREAM });
      publishWindowState({ type: 'stream-sync', streamState: INITIAL_STREAM });
    },

    // ── Models & server ────────────────────────────────────────────

    setModels: (models: ModelInfo[]) => set({ models }),
    setModelsLoading: (loading: boolean) => set({ modelsLoading: loading }),
    setSelectedModel: (model: string) => set({ selectedModel: model }),
    setServerInfo: (info: ServerInfo | null) => set({ serverInfo: info }),
    setSavings: (data: SavingsData | null) => set({ savings: data }),

    // ── Settings ───────────────────────────────────────────────────

    updateSettings: (partial: Partial<Settings>) => {
      const updated = { ...get().settings, ...partial };
      saveSettings(updated);
      set({ settings: updated });
      publishWindowState({ type: 'settings-sync', settings: updated });
    },

    // ── UI ──────────────────────────────────────────────────────────

    setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
    toggleSystemPanel: () => set((s) => ({ systemPanelOpen: !s.systemPanelOpen })),
    setSystemPanelOpen: (open: boolean) => set({ systemPanelOpen: open }),

    // ── Agents ─────────────────────────────────────────────────────

    managedAgents: [],
    managedAgentsLoading: false,
    selectedAgentId: null,

    setManagedAgents: (agents) => set({ managedAgents: agents }),
    setManagedAgentsLoading: (loading) => set({ managedAgentsLoading: loading }),
    setSelectedAgentId: (id) => set({ selectedAgentId: id }),

    agentEvents: [],
    addAgentEvent: (event) => set((s) => ({
      agentEvents: [...s.agentEvents.slice(-99), event],
    })),
    clearAgentEvents: () => set({ agentEvents: [] }),

    // ── Logs ────────────────────────────────────────────────────────
    logEntries: [],
    addLogEntry: (entry) => set((s) => ({
      logEntries: [...s.logEntries.slice(-499), entry],
    })),
    clearLogs: () => set({ logEntries: [] }),

    // ── Model loading ───────────────────────────────────────────────
    modelLoading: false,
    setModelLoading: (loading) => set({ modelLoading: loading }),

    // ── Opt-in sharing ──────────────────────────────────────────────

    setOptIn: (enabled: boolean, displayName: string, email: string) => {
      const anonId = get().optInAnonId;
      localStorage.setItem(OPTIN_KEY, String(enabled));
      localStorage.setItem(OPTIN_NAME_KEY, displayName);
      localStorage.setItem(OPTIN_EMAIL_KEY, email);
      localStorage.setItem(OPTIN_ANONID_KEY, anonId);
      set({ optInEnabled: enabled, optInDisplayName: displayName, optInEmail: email });
    },
    setOptInModalOpen: (open: boolean) => set({ optInModalOpen: open }),
    markOptInModalSeen: () => {
      localStorage.setItem(OPTIN_SEEN_KEY, 'true');
      set({ optInModalSeen: true });
    },

    // ── Workflows ────────────────────────────────────────────────────
    workflows: JSON.parse(localStorage.getItem(WORKFLOWS_KEY) || '[]') as Workflow[],

    addWorkflow: (w) => {
      const next = [...get().workflows, w];
      localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(next));
      set({ workflows: next });
      // Persist server-side so the scheduler runs it without the UI open.
      // localStorage stays as the offline mirror.
      void pushWorkflow(w).then((saved) => {
        if (!saved || saved.id === w.id) return;
        const remapped = get().workflows.map((x) => (x.id === w.id ? { ...x, id: saved.id } : x));
        localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(remapped));
        set({ workflows: remapped });
      });
    },
    deleteWorkflow: (id) => {
      const next = get().workflows.filter(w => w.id !== id);
      localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(next));
      set({ workflows: next });
      void dropWorkflow(id);
    },
    updateWorkflow: (id, patch) => {
      const next = get().workflows.map(w => w.id === id ? { ...w, ...patch } : w);
      localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(next));
      set({ workflows: next });
      const updated = next.find((w) => w.id === id);
      if (updated && 'enabled' in patch) void toggleWorkflow(id, updated.enabled);
    },
    replaceWorkflows: (list) => {
      localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(list));
      set({ workflows: list });
    },
    markWorkflowRan: (id) => {
      const next = get().workflows.map(w => w.id === id ? { ...w, lastRun: Date.now() } : w);
      localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(next));
      set({ workflows: next });
    },
  };
});


// Server-side workflow sync. Failures are non-fatal: the localStorage copy
// keeps the UI working while the backend is unreachable.
async function pushWorkflow(w: Workflow) {
  try {
    const { saveServerWorkflow } = await import('./api');
    return await saveServerWorkflow(w);
  } catch {
    return null;
  }
}

async function dropWorkflow(id: string) {
  try {
    const { deleteServerWorkflow } = await import('./api');
    await deleteServerWorkflow(id);
  } catch { /* offline */ }
}

async function toggleWorkflow(id: string, enabled: boolean) {
  try {
    const { setServerWorkflowEnabled } = await import('./api');
    await setServerWorkflowEnabled(id, enabled);
  } catch { /* offline */ }
}

const sync = getSyncChannel();
if (sync) {
  sync.onmessage = (event) => {
    const data = event.data || {};
    if (data.source === WINDOW_ID) return;
    applyingRemoteState = true;
    try {
      if (data.type === 'conversation-sync') {
        useAppStore.setState({
          conversations: data.conversations || [],
          activeId: data.activeId || null,
          messages: data.messages || [],
        });
      } else if (data.type === 'stream-sync') {
        useAppStore.setState({
          streamState: data.streamState || INITIAL_STREAM,
        });
      } else if (data.type === 'settings-sync') {
        useAppStore.setState({
          settings: data.settings || loadSettings(),
        });
      }
    } finally {
      applyingRemoteState = false;
    }
  };
}

export { generateId };
