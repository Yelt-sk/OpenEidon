import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  Wifi, WifiOff, Loader2, Trash2, Download, Upload, Check,
  RefreshCw, Sun, Moon, Monitor, X, Plus,
} from 'lucide-react';
import { MessageBubble } from '../components/Chat/MessageBubble';
import { StreamingDots } from '../components/Chat/StreamingDots';
import { ToolCallCard } from '../components/Chat/ToolCallCard';
import { InputArea } from '../components/Chat/InputArea';
import { NewWorkflowModal } from '../components/Workflow/NewWorkflowModal';
import { useAppStore, type ThemeMode } from '../lib/store';
import { listMemoryFacts, saveMemoryFact, deleteMemoryFact, type MemoryFact, type MemoryFactCounts, checkHealth, fetchSpeechHealth, buildAgentPlan, getUserPreferences, fetchInstalledApps, playYouTubeQuery, openLocalApp, openLocalAppDirect, openExternalTarget, webSearch, fetchChatCompletion, setReminder, getFileRoots, setFileRoots } from '../lib/api';
import type { Workflow } from '../lib/store';
import { useSpeechOutput } from '../hooks/useSpeechOutput';

const API_BASE = 'http://127.0.0.1:8000';
async function fetchCheckInSettings(): Promise<{ enabled: boolean; interval_minutes: number }> {
  try { const r = await fetch(`${API_BASE}/v1/checkin/settings`); return r.json(); }
  catch { return { enabled: true, interval_minutes: 30 }; }
}
async function saveCheckInSettings(s: { enabled: boolean; interval_minutes: number }) {
  await fetch(`${API_BASE}/v1/checkin/settings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s),
  });
}

/* ── Shared style tokens for legacy settings panels ────────────────── */
const cardBg1 = 'linear-gradient(180deg, rgba(20,18,15,0.9), rgba(15,12,10,0.9))';
const cardBg2 = 'linear-gradient(180deg, rgba(15,12,10,0.9), rgba(10,8,6,0.9))';
const cardBorder = '1px solid rgba(237,231,222,0.08)';
const inputBg = 'rgba(21,20,19,0.9)';
const textMain = '#ede7de';
const textSec = '#a8a29a';
const textTert = '#5c5851';
const textContent = '#dceccc';
const accentCyan = 'oklch(0.72 0.17 45)';
const accentFaint = 'rgba(255,120,40,0.08)';
const labelColor = '#a8a29a';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>
      {children}
    </div>
  );
}
function Panel({ children, style, className = '' }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${className}`} style={{ border: cardBorder, ...style }}>
      {children}
    </div>
  );
}
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{ position: 'relative', width: 36, height: 20, borderRadius: 999, background: value ? accentCyan : 'rgba(255,255,255,0.08)', border: `1px solid ${value ? accentCyan : 'rgba(237,231,222,0.15)'}`, cursor: 'pointer', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'transform 0.2s', transform: value ? 'translateX(16px)' : 'translateX(0)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
    </button>
  );
}
function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: cardBorder }}>
      <div>
        <div style={{ fontSize: 12, color: textMain }}>{label}</div>
        {desc && <div style={{ fontSize: 10, color: textTert, marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

/* ── Check-in panel ─────────────────────────────────────────────────── */
function CheckInPanel() {
  const [enabled, setEnabled] = useState(true);
  const [interval, setIntervalVal] = useState(30);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetchCheckInSettings().then(s => { setEnabled(s.enabled); setIntervalVal(s.interval_minutes); }).catch(() => {});
  }, []);
  const save = async () => { await saveCheckInSettings({ enabled, interval_minutes: interval }); setSaved(true); setTimeout(() => setSaved(false), 1400); };
  const INTERVALS = [15, 30, 60, 120];
  return (
    <Panel style={{ background: cardBg1 }}>
      <Label>Check-in напоминания</Label>
      <Row label="Включить" desc="Eidon всплывёт и спросит чем ты занимаешься">
        <Toggle value={enabled} onChange={setEnabled} />
      </Row>
      {enabled && (
        <Row label="Интервал">
          <div style={{ display: 'flex', gap: 4 }}>
            {INTERVALS.map(v => (
              <button key={v} onClick={() => setIntervalVal(v)}
                style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, cursor: 'pointer', background: interval === v ? accentFaint : 'transparent', color: interval === v ? accentCyan : textTert, border: interval === v ? cardBorder : '1px solid transparent' }}>
                {v >= 60 ? `${v / 60}ч` : `${v}м`}
              </button>
            ))}
          </div>
        </Row>
      )}
      <div style={{ paddingTop: 10 }}>
        <button onClick={save}
          style={{ fontSize: 11, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', background: saved ? 'rgba(110,240,140,0.2)' : accentFaint, color: saved ? '#6ef08c' : accentCyan, border: cardBorder }}>
          {saved ? 'Сохранено ✓' : 'Сохранить'}
        </button>
      </div>
    </Panel>
  );
}

/* ── File Access panel ──────────────────────────────────────────────── */
function FileAccessPanel() {
  const [roots, setRoots] = useState<string[]>([]);
  const [defaults, setDefaults] = useState<string[]>([]);
  const [newPath, setNewPath] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getFileRoots().then(data => {
      setDefaults(data.defaults);
      setRoots(data.roots);
    }).catch(() => {});
  }, []);

  const customRoots = roots.filter(r => !defaults.includes(r));

  const save = async (next: string[]) => {
    await setFileRoots(next);
    const data = await getFileRoots();
    setRoots(data.roots);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  const add = () => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    if (roots.includes(trimmed)) { setError('Уже добавлено'); setTimeout(() => setError(''), 2000); return; }
    setError('');
    setNewPath('');
    save([...customRoots, trimmed]);
  };

  const remove = (path: string) => save(customRoots.filter(r => r !== path));

  return (
    <Panel style={{ background: cardBg2 }}>
      <Label>Доступ к файлам</Label>
      <div style={{ fontSize: 11, color: textTert, marginBottom: 8 }}>
        Eidon может читать файлы из этих папок. Скажи «покажи файлы на рабочем столе» или «прочитай мою курсовую».
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: textTert, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>По умолчанию</div>
        {defaults.map(d => (
          <div key={d} style={{ fontSize: 11, color: textSec, padding: '3px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6ef08c', flexShrink: 0, display: 'inline-block' }} />
            {d}
          </div>
        ))}
      </div>
      {customRoots.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: textTert, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Добавленные</div>
          {customRoots.map(r => (
            <div key={r} style={{ fontSize: 11, color: textSec, padding: '3px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: accentCyan, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ flex: 1 }}>{r}</span>
              <button onClick={() => remove(r)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: 2 }}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text"
          value={newPath}
          onChange={e => setNewPath(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="D:\Users\me\University"
          style={{ flex: 1, fontSize: 11, padding: '4px 8px', borderRadius: 8, outline: 'none', background: inputBg, color: textMain, border: cardBorder }}
        />
        <button onClick={add}
          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', background: accentFaint, color: accentCyan, border: cardBorder }}>
          <Plus size={11} />
        </button>
      </div>
      {error && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>{error}</div>}
      {saved && <div style={{ fontSize: 10, color: '#6ef08c', marginTop: 4 }}>Сохранено ✓</div>}
    </Panel>
  );
}

/* ── Settings panel ─────────────────────────────────────────────────── */
function SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const conversations = useAppStore((s) => s.conversations);
  const models = useAppStore((s) => s.models);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [speechOk, setSpeechOk] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    checkHealth().then(setHealthy).catch(() => setHealthy(false));
    fetchSpeechHealth().then((h) => setSpeechOk(h.available)).catch(() => setSpeechOk(false));
  }, []);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1400); };
  const set = (p: Parameters<typeof updateSettings>[0]) => { updateSettings(p); flash(); };

  const themes: { v: ThemeMode; icon: typeof Sun }[] = [
    { v: 'light', icon: Sun }, { v: 'dark', icon: Moon }, { v: 'system', icon: Monitor },
  ];
  const miniBtn: React.CSSProperties = {
    background: accentFaint, border: cardBorder, color: textSec,
    borderRadius: 8, padding: '3px 9px', fontSize: 11, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 4,
  };

  const handleExport = () => {
    const blob = new Blob([localStorage.getItem('openeidon-conversations') || '{}'], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `eidon-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
  };
  const handleImport = () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.version === 1) { localStorage.setItem('openeidon-conversations', JSON.stringify(data)); useAppStore.getState().loadConversations(); flash(); }
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  };
  const handleClear = () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return; }
    localStorage.removeItem('openeidon-conversations'); useAppStore.getState().loadConversations();
    setConfirmClear(false); flash();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: accentFaint, border: cardBorder, color: accentCyan, fontSize: 12 }}>
          <Check size={11} /> Сохранено
        </div>
      )}
      <Panel style={{ background: cardBg1 }}>
        <Label>Тема</Label>
        <Row label="Тема оформления">
          <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
            {themes.map(({ v, icon: Icon }) => (
              <button key={v} onClick={() => set({ theme: v })} title={v}
                style={{ padding: 6, borderRadius: 6, cursor: 'pointer', background: settings.theme === v ? accentFaint : 'transparent', color: settings.theme === v ? accentCyan : textTert, border: settings.theme === v ? cardBorder : '1px solid transparent' }}>
                <Icon size={12} />
              </button>
            ))}
          </div>
        </Row>
        <Row label="Размер шрифта">
          <select value={settings.fontSize} onChange={(e) => set({ fontSize: e.target.value as 'small' | 'default' | 'large' })}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, outline: 'none', background: inputBg, color: textMain, border: cardBorder, cursor: 'pointer' }}>
            <option value="small">Маленький</option>
            <option value="default">Обычный</option>
            <option value="large">Большой</option>
          </select>
        </Row>
      </Panel>

      <Panel style={{ background: cardBg2 }}>
        <Label>Подключение</Label>
        <Row label="Бэкенд">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {healthy === null ? <Loader2 size={11} className="animate-spin" style={{ color: textTert }} />
              : healthy ? <Wifi size={12} style={{ color: '#6ef08c' }} />
              : <WifiOff size={12} style={{ color: '#ef4444' }} />}
            <span style={{ fontSize: 11, color: healthy ? '#6ef08c' : healthy === false ? '#ef4444' : textTert }}>
              {healthy === null ? 'Проверка…' : healthy ? 'Подключён' : 'Отключён'}
            </span>
            <button onClick={() => { setHealthy(null); checkHealth().then(setHealthy).catch(() => setHealthy(false)); }}
              style={{ cursor: 'pointer', background: 'none', border: 'none', color: textTert, display: 'flex' }}>
              <RefreshCw size={10} />
            </button>
          </div>
        </Row>
        <Row label="API URL">
          <input type="text" value={settings.apiUrl} onChange={(e) => set({ apiUrl: e.target.value })}
            placeholder="http://localhost:8000" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, outline: 'none', width: 160, background: inputBg, color: textMain, border: cardBorder }} />
        </Row>
      </Panel>

      <Panel style={{ background: cardBg1 }}>
        <Label>Модели</Label>
        {models.length === 0
          ? <div style={{ fontSize: 11, color: textTert }}>Нет загруженных моделей</div>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {models.slice(0, 8).map((m) => (
              <span key={m.id} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, background: accentFaint, color: textSec, border: cardBorder }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6ef08c', display: 'inline-block', marginRight: 4 }} />
                {m.id}
              </span>
            ))}
          </div>}
      </Panel>

      <Panel style={{ background: cardBg2 }}>
        <Label>Параметры модели</Label>
        <Row label="Temperature" desc={`${settings.temperature}`}>
          <input type="range" min="0" max="2" step="0.1" value={settings.temperature}
            onChange={(e) => set({ temperature: parseFloat(e.target.value) })}
            style={{ width: 96, cursor: 'pointer', accentColor: accentCyan }} />
        </Row>
        <Row label="Max tokens" desc={`${settings.maxTokens}`}>
          <input type="range" min="256" max="32768" step="256" value={settings.maxTokens}
            onChange={(e) => set({ maxTokens: parseInt(e.target.value) })}
            style={{ width: 96, cursor: 'pointer', accentColor: accentCyan }} />
        </Row>
      </Panel>

      <Panel style={{ background: cardBg1 }}>
        <Label>Голос</Label>
        <Row label="Speech-to-Text"><Toggle value={settings.speechEnabled} onChange={(v) => set({ speechEnabled: v })} /></Row>
        <Row label="Push-to-Talk" desc="Ctrl+Shift+Space"><Toggle value={settings.pushToTalkEnabled} onChange={(v) => set({ pushToTalkEnabled: v })} /></Row>
        <Row label="Авто-отправка голоса"><Toggle value={settings.speechAutoSend} onChange={(v) => set({ speechAutoSend: v })} /></Row>
        <Row label="Озвучивать ответы"><Toggle value={settings.speechOutputEnabled} onChange={(v) => set({ speechOutputEnabled: v })} /></Row>
        <Row label="Бэкенд речи">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: speechOk ? '#6ef08c' : '#636366', display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: textTert }}>{speechOk === null ? 'Проверка…' : speechOk ? 'Доступен' : 'Не настроен'}</span>
          </div>
        </Row>
      </Panel>

      <CheckInPanel />

      <FileAccessPanel />

      <Panel style={{ background: cardBg2 }}>
        <Label>Данные</Label>
        <Row label="Разговоры" desc={`${conversations.length} сохранено`}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleExport} style={miniBtn}><Download size={9} /> Экспорт</button>
            <button onClick={handleImport} style={miniBtn}><Upload size={9} /> Импорт</button>
          </div>
        </Row>
        <Row label="Очистить всё">
          <button onClick={handleClear} style={{ ...miniBtn, color: confirmClear ? '#fff' : '#ef4444', background: confirmClear ? 'rgba(239,68,68,0.25)' : 'transparent', border: '1px solid rgba(239,68,68,0.35)' }}>
            <Trash2 size={9} /> {confirmClear ? 'Подтвердить?' : 'Очистить'}
          </button>
        </Row>
      </Panel>
    </div>
  );
}

/* ── Tweaks ──────────────────────────────────────────────────────────── */
const ACCENTS: Record<string, string> = {
  amber: 'oklch(0.72 0.17 45)',
  violet: 'oklch(0.65 0.22 285)',
  oxide: 'oklch(0.68 0.15 165)',
  cobalt: 'oklch(0.65 0.22 250)',
  ember: 'oklch(0.65 0.22 25)',
  bone: 'oklch(0.80 0.04 60)',
};
const DENSITIES = {
  cozy: '28px',
  normal: '22px',
  compact: '8px',
};

/* ── Time helper ─────────────────────────────────────────────────────── */
function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/* ── Quick suggestions ───────────────────────────────────────────────── */
const CHIPS = ['Открой YouTube', 'Включи музыку', 'Открой VS Code', 'Найди сайты про Python'];

/* ── Main App ────────────────────────────────────────────────────────── */
export function EidonApp() {
  useSpeechOutput();

  const messages = useAppStore((s) => s.messages);
  const streamState = useAppStore((s) => s.streamState);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const conversations = useAppStore((s) => s.conversations);
  const activeId = useAppStore((s) => s.activeId);
  const createConversation = useAppStore((s) => s.createConversation);
  const selectConversation = useAppStore((s) => s.selectConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant);
  const workflows = useAppStore((s) => s.workflows);
  const deleteWorkflow = useAppStore((s) => s.deleteWorkflow);
  const markWorkflowRan = useAppStore((s) => s.markWorkflowRan);
  const updateWorkflow = useAppStore((s) => s.updateWorkflow);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);
  const [mode, setMode] = useState<'chat' | 'cmd' | 'voice' | 'agent'>('chat');
  const [trailTab, setTrailTab] = useState<'now' | 'timeline' | 'tools'>('now');
  const [trailVisible, setTrailVisible] = useState(true);
  const [online, setOnline] = useState<boolean | null>(null);
  const [convSearch, setConvSearch] = useState('');
  const [showTweaks, setShowTweaks] = useState(false);
  const [accent, setAccent] = useState(() => localStorage.getItem('eidon-accent') || 'amber');
  const [density, setDensity] = useState<'cozy' | 'normal' | 'compact'>(() => (localStorage.getItem('eidon-density') as 'cozy' | 'normal' | 'compact') || 'normal');
  const [grainOn, setGrainOn] = useState(() => localStorage.getItem('eidon-grain') !== 'false');

  const listRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  // health check on mount
  useEffect(() => {
    checkHealth().then(setOnline).catch(() => setOnline(false));
  }, []);

  // Structured memory (People / Projects / Preferences)
  const [memoryCounts, setMemoryCounts] = useState<MemoryFactCounts>({ person: 0, project: 0, preference: 0 });
  const [memoryKind, setMemoryKind] = useState<'person' | 'project' | 'preference' | null>(null);
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
  const [memoryDraft, setMemoryDraft] = useState({ name: '', detail: '' });

  const refreshMemory = useCallback(async (kind?: 'person' | 'project' | 'preference' | null) => {
    try {
      const data = await listMemoryFacts(kind || undefined);
      setMemoryCounts(data.counts);
      if (kind) setMemoryFacts(data.facts);
    } catch {
      /* backend offline — leave counts as they are */
    }
  }, []);

  useEffect(() => { refreshMemory(); }, [refreshMemory]);

  const openMemoryKind = useCallback((kind: 'person' | 'project' | 'preference') => {
    setMemoryKind((current) => {
      const next = current === kind ? null : kind;
      if (next) refreshMemory(next);
      return next;
    });
  }, [refreshMemory]);

  const addMemoryFact = useCallback(async () => {
    if (!memoryKind || !memoryDraft.name.trim()) return;
    await saveMemoryFact(memoryKind, memoryDraft.name.trim(), memoryDraft.detail.trim());
    setMemoryDraft({ name: '', detail: '' });
    refreshMemory(memoryKind);
  }, [memoryKind, memoryDraft, refreshMemory]);

  const removeMemoryFact = useCallback(async (factId: string) => {
    await deleteMemoryFact(factId);
    refreshMemory(memoryKind);
  }, [memoryKind, refreshMemory]);

  // Workflow scheduler
  useEffect(() => {
    const runWorkflow = async (wf: Workflow) => {
      markWorkflowRan(wf.id);
      if (wf.regularity === 'once') updateWorkflow(wf.id, { enabled: false });

      // Always read current model from store — avoid stale closure
      const model = useAppStore.getState().selectedModel;

      const convId = useAppStore.getState().createConversation(model);
      useAppStore.setState(s => ({
        conversations: s.conversations.map(c =>
          c.id === convId ? { ...c, title: wf.name } : c
        ),
      }));
      useAppStore.getState().selectConversation(convId);

      const triggerMsg = { id: Math.random().toString(36).slice(2), role: 'user' as const, content: `[Workflow] ${wf.name}\n\n${wf.instructions}`, timestamp: Date.now() };
      useAppStore.getState().addMessage(convId, triggerMsg);
      const assistantMsg = { id: Math.random().toString(36).slice(2), role: 'assistant' as const, content: 'Running workflow...', timestamp: Date.now() };
      useAppStore.getState().addMessage(convId, assistantMsg);

      try {
        const [prefs, installedApps, fileRootsData] = await Promise.all([getUserPreferences(), fetchInstalledApps(), getFileRoots()]);
        const plan = await buildAgentPlan(wf.instructions, prefs, model, installedApps, fileRootsData.roots);
        if (plan && plan.steps.length > 0) {
          const actionResults: string[] = [];
          for (const step of plan.steps) {
            for (const action of step.actions) {
              try {
                if (action.tool === 'open_app' && action.name) {
                  try { await openLocalAppDirect(action.name); } catch { await openLocalApp(action.name); }
                  actionResults.push(`Открыл приложение: **${action.name}**`);
                } else if (action.tool === 'play_youtube' && action.query) {
                  await playYouTubeQuery(action.query);
                  actionResults.push(`Включил на YouTube: **${action.query}**`);
                } else if (action.tool === 'open_site' && action.url) {
                  await openExternalTarget(action.url);
                  actionResults.push(`Открыл сайт: ${action.url}`);
                } else if (action.tool === 'web_search') {
                  const sr = await webSearch(action.query || wf.instructions);
                  if (sr.success && sr.content) {
                    const synth = await fetchChatCompletion({ model, messages: [
                      { role: 'system', content: 'Summarize search results in Russian concisely. 3-5 bullet points.' },
                      { role: 'user', content: `Query: ${action.query || wf.instructions}\n\n${sr.content}` },
                    ], temperature: 0.3, max_tokens: 600 });
                    const summary = synth?.choices?.[0]?.message?.content?.trim();
                    if (summary) actionResults.push(summary);
                  }
                } else if (action.tool === 'set_reminder') {
                  await setReminder(action.text || '', action.delay_seconds, action.due_at);
                  actionResults.push(`Напоминание: **${action.text}**`);
                } else if (action.tool === 'open_work_apps') {
                  for (const app of prefs.work_apps) {
                    try { await openLocalApp(app); } catch {}
                  }
                  actionResults.push(`Открыл рабочие программы: ${prefs.work_apps.join(', ')}`);
                }
              } catch {}
            }
          }
          const finalText = actionResults.length > 0
            ? `Workflow **${wf.name}** выполнен:\n\n${actionResults.join('\n\n')}`
            : (plan.summary || `Workflow "${wf.name}" completed.`);
          useAppStore.getState().updateLastAssistant(convId, finalText);
        } else {
          useAppStore.getState().updateLastAssistant(convId, `Workflow "${wf.name}" started but no actions were planned.`);
        }
      } catch (e: any) {
        useAppStore.getState().updateLastAssistant(convId, `Workflow "${wf.name}" failed: ${e?.message || String(e)}`);
      }
    };

    const tick = () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
      // Convert to Mon=0..Sun=6 to match our weekdays array (M=0..S=6)
      const wdIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      for (const wf of useAppStore.getState().workflows) {
        if (!wf.enabled || wf.time !== currentTime) continue;
        const msSinceLastRun = wf.lastRun ? now.getTime() - wf.lastRun : Infinity;
        if (msSinceLastRun < 60_000) continue;
        if (wf.regularity === 'weekdays' && wdIdx > 4) continue;
        if (wf.regularity === 'weekly' && !wf.weekdays.includes(wdIdx)) continue;
        runWorkflow(wf);
      }
    };

    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, []);

  // auto-scroll
  useEffect(() => {
    if (autoScroll.current && listRef.current)
      listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, streamState.content]);

  const onScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    autoScroll.current = scrollHeight - scrollTop - clientHeight < 80;
  };

  // Apply accent color
  useEffect(() => {
    document.documentElement.style.setProperty('--fox', ACCENTS[accent] || ACCENTS.amber);
    localStorage.setItem('eidon-accent', accent);
  }, [accent]);

  // Apply density
  useEffect(() => {
    document.documentElement.style.setProperty('--conv-gap', DENSITIES[density] || DENSITIES.normal);
    localStorage.setItem('eidon-density', density);
  }, [density]);

  // Apply grain toggle
  useEffect(() => {
    document.documentElement.style.setProperty('--grain-opacity', grainOn ? '0.04' : '0');
    localStorage.setItem('eidon-grain', String(grainOn));
  }, [grainOn]);

  // Daily token/tool-call stats from current conversation messages
  const tokensToday = useMemo(() =>
    messages.reduce((sum, m) => sum + (m.usage?.total_tokens || 0), 0)
  , [messages]);
  const toolCallsSession = useMemo(() =>
    messages.reduce((sum, m) => sum + (m.toolCalls?.length || 0), 0)
  , [messages]);

  // Filtered conversations
  const filteredConvs = useMemo(() =>
    convSearch.trim()
      ? conversations.filter(c => (c.title || '').toLowerCase().includes(convSearch.toLowerCase()))
      : conversations
  , [conversations, convSearch]);

  // collect tool calls for trail timeline
  const trailToolCalls = useMemo(() => {
    return messages.flatMap(m =>
      (m.toolCalls || []).map(tc => ({ ...tc, msgTs: m.timestamp || 0 }))
    ).slice(-20).reverse();
  }, [messages]);

  const currentConv = conversations.find(c => c.id === activeId);
  const isEmpty = messages.length === 0 && !streamState.isStreaming;

  const handleNewConv = useCallback(() => {
    if (messages.length > 0) createConversation(selectedModel);
  }, [messages.length, createConversation, selectedModel]);

  const modelLabel = selectedModel || serverInfo?.model || '—';

  return (
    <>
      {/* macOS-style window */}
      <div className="eidon-window">

        {/* ── Titlebar ── */}
        <div className="titlebar">
          <div className="tb-left">
            <div className="traffic">
              <i className="r" />
              <i className="y" />
              <i className="g" />
            </div>
            <div className="tb-brand">
              <span className="dot" />
              <span>Eidon</span>
              <span style={{ color: 'var(--ink-ghost)' }}>·</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>V1.0 · FOX</span>
            </div>
          </div>

          <div className="tb-center">
            <span style={{ color: 'var(--ink-faint)' }}>⌕</span>
            <span className="ghost">Ask, command, or search…</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, fontSize: 9 }}>
              <kbd style={{ padding: '1px 5px', border: '1px solid var(--line)', borderRadius: 3, fontFamily: 'inherit' }}>⌥</kbd>
              <kbd style={{ padding: '1px 5px', border: '1px solid var(--line)', borderRadius: 3, fontFamily: 'inherit' }}>Space</kbd>
            </span>
          </div>

          <div className="tb-right">
            <div className="tb-status">
              <span className={`tb-ping ${online === false ? 'offline' : ''}`} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>ON-DEVICE</span>
            </div>
            <div className="tb-model">
              <span style={{ color: 'var(--fox)' }}>◆</span>
              <span>{modelLabel}</span>
              <span style={{ color: 'var(--ink-ghost)' }}>▾</span>
            </div>
          </div>
        </div>

        {/* ── 3-col body ── */}
        <div className="eidon-app" style={!trailVisible ? { gridTemplateColumns: '260px 1fr' } : undefined}>

          {/* ── Sidebar ── */}
          <aside className="sidebar">
            <div className="sb-section">
              <div className="persona-card">
                <div className="pc-top">
                  <div className="pc-avatar">E</div>
                  <div>
                    <div className="pc-name">Eidon</div>
                    <div className="pc-role">Default · Strategist</div>
                  </div>
                </div>
                <div className="pc-meter">
                  <i className="on" /><i className="on" /><i /><i />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.1em', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>
                  <span>AUTONOMY · PREVIEW</span>
                  <span style={{ color: 'var(--fox)', cursor: 'pointer' }}>EDIT ›</span>
                </div>
              </div>
            </div>

            {/* Conversations */}
            <div className="sb-section sb-scroll-section">
              <div className="sb-head">
                <span className="t">Conversations</span>
                <button className="sb-add" onClick={handleNewConv} title="New chat"><Plus size={12} /></button>
              </div>
              {conversations.length > 3 && (
                <input
                  value={convSearch}
                  onChange={e => setConvSearch(e.target.value)}
                  placeholder="Search…"
                  style={{
                    width: '100%', boxSizing: 'border-box', marginBottom: 4,
                    padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)',
                    background: 'var(--bg-2)', color: 'var(--ink)', fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace", outline: 'none',
                  }}
                />
              )}
              <div className="sb-list">
                {filteredConvs.length === 0 && (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--ink-ghost)', padding: '8px 10px' }}>
                    {convSearch ? 'No results' : 'No conversations yet'}
                  </div>
                )}
                {filteredConvs.map(conv => (
                  <div
                    key={conv.id}
                    style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                  >
                    <button
                      className={`sb-item ${conv.id === activeId ? 'active' : ''}`}
                      style={{ flex: 1, minWidth: 0 }}
                      onClick={() => selectConversation(conv.id)}
                    >
                      <span className="sb-ico">{conv.id === activeId ? '◆' : '◇'}</span>
                      <span className="sb-label">{conv.title || 'New conversation'}</span>
                      {conv.id === activeId && streamState.isStreaming && <span className="sb-live" />}
                      {conv.messages?.length > 0 && (
                        <span className="sb-badge" style={{ marginLeft: 'auto', flexShrink: 0 }}>{conv.messages.length}</span>
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                      title="Удалить диалог"
                      className="conv-del-btn"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Workflows */}
              <div className="sb-head" style={{ marginTop: 12 }}>
                <span className="t">Workflows</span>
                <button className="sb-add" onClick={() => setShowNewWorkflow(true)}>+</button>
              </div>
              <div className="sb-list">
                {workflows.length === 0 && (
                  <div style={{ padding: '6px 8px', fontSize: 10, color: 'var(--ink-faint)' }}>No workflows yet</div>
                )}
                {workflows.map(wf => (
                  <div key={wf.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <div className="sb-item" style={{ flex: 1, minWidth: 0 }}>
                      <span className="sb-ico">{wf.enabled ? '▶' : '⏸'}</span>
                      <span className="sb-label">{wf.name}</span>
                      <span className="sb-badge" style={{ marginLeft: 'auto', flexShrink: 0 }}>{wf.time}</span>
                    </div>
                    <button
                      onClick={() => deleteWorkflow(wf.id)}
                      title="Удалить workflow"
                      className="conv-del-btn"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Memory */}
              <div className="sb-head" style={{ marginTop: 12 }}>
                <span className="t">Memory</span>
                <button className="sb-add">⌕</button>
              </div>
              <div className="sb-list">
                {([
                  ['person', 'People', memoryCounts.person],
                  ['project', 'Projects', memoryCounts.project],
                  ['preference', 'Preferences', memoryCounts.preference],
                ] as const).map(([kind, label, count]) => (
                  <div key={kind}>
                    <div
                      className={`sb-item${memoryKind === kind ? ' active' : ''}`}
                      onClick={() => openMemoryKind(kind)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="sb-ico">◈</span>
                      <span className="sb-label">{label} · {count}</span>
                    </div>
                    {memoryKind === kind && (
                      <div style={{ padding: '4px 0 8px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {memoryFacts.map((fact) => (
                          <div key={fact.id} className="sb-item" style={{ alignItems: 'flex-start' }}>
                            <span className="sb-label" style={{ flex: 1 }} title={fact.detail}>
                              {fact.name}
                              {fact.detail ? <span style={{ opacity: 0.6 }}> — {fact.detail}</span> : null}
                            </span>
                            <button className="sb-add" title="Forget" onClick={(e) => { e.stopPropagation(); removeMemoryFact(fact.id); }}>×</button>
                          </div>
                        ))}
                        <input
                          className="sb-search"
                          placeholder="name"
                          value={memoryDraft.name}
                          onChange={(e) => setMemoryDraft((d) => ({ ...d, name: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') addMemoryFact(); }}
                        />
                        <input
                          className="sb-search"
                          placeholder="detail (optional)"
                          value={memoryDraft.detail}
                          onChange={(e) => setMemoryDraft((d) => ({ ...d, detail: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') addMemoryFact(); }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="sb-footer">
              <div className="sb-user">
                <div className="sb-av">AV</div>
                <div className="sb-uname">
                  User
                  <span className="sub">LOCAL</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="sb-cog" onClick={() => setShowTweaks(v => !v)} title="Tweaks" style={showTweaks ? { color: 'var(--fox)' } : undefined}>✦</button>
                <button className="sb-cog" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
              </div>
            </div>
          </aside>

          {/* ── Main chat ── */}
          <main className="eidon-main">
            <div className="main-head">
              <div>
                <div className="mh-title">
                  <span className="mh-pin" />
                  {currentConv?.title || 'Eidon'}
                </div>
                <div className="mh-sub">
                  {streamState.isStreaming
                    ? (streamState.phase || 'WORKING').toUpperCase()
                    : `${messages.length} MESSAGES`}
                </div>
              </div>
              <div className="mh-right">
                <button className="icon-btn" title="New chat" onClick={handleNewConv}>+</button>
              </div>
            </div>

            <div className="chat-scroll" ref={listRef} onScroll={onScroll}>
              {isEmpty ? (
                <div className="empty-state">
                  <div className="empty-av">E</div>
                  <div style={{ textAlign: 'center' }}>
                    <div className="empty-title">Привет, я Eidon</div>
                    <div className="empty-sub">Ваш локальный AI-ассистент</div>
                  </div>
                </div>
              ) : (
                <div className="conv">
                  {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}

                  {/* Streaming message */}
                  {streamState.isStreaming && (
                    <div className="msg eidon">
                      <div className="av">E</div>
                      <div className="bubble">
                        <div className="who">
                          <span>EIDON</span>
                          <span className="time">{streamState.phase || 'thinking'}</span>
                        </div>
                        <div className="text">
                          {streamState.activeToolCalls.map((t) => (
                            <ToolCallCard key={t.id} toolCall={t} />
                          ))}
                          {streamState.content
                            ? <>{streamState.content}<span className="typing-caret" /></>
                            : streamState.activeToolCalls.length === 0
                              ? <StreamingDots phase={streamState.phase || ''} />
                              : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Chips — always visible below messages */}
              {isEmpty && (
                <div className="chips">
                  {CHIPS.map(c => (
                    <div key={c} className="chip"><span className="ico">◆</span>{c}</div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Composer ── */}
            <div className="composer">
              <div className="cbox">
                <div className="ci-top">
                  <div className="modes">
                    {(['chat', 'cmd', 'voice', 'agent'] as const).map(m => (
                      <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="autonomy-lbl">
                    Autonomy: <b>Preview</b>
                    <span style={{ color: 'var(--ink-ghost)' }}>▾</span>
                  </div>
                </div>
                <div className="ci-main">
                  <InputArea mode={mode} />
                </div>
              </div>
              <div className="ci-foot">
                <div className="tools">
                  <span>◆ LOCAL</span>
                  <span
                    style={{ cursor: 'pointer', color: trailVisible ? 'inherit' : 'var(--ink-ghost)' }}
                    onClick={() => setTrailVisible(v => !v)}
                    title="Toggle trail"
                  >
                    ◆ {trailVisible ? 'TRAIL ON' : 'TRAIL OFF'}
                  </span>
                  {streamState.isStreaming && <span style={{ color: 'var(--fox)' }}>◆ WORKING</span>}
                </div>
                <div>
                  <kbd>⏎</kbd> send · <kbd>⇧⏎</kbd> newline · <kbd>Ctrl⇧Space</kbd> voice
                </div>
              </div>
            </div>
          </main>

          {/* ── Trail panel ── */}
          {trailVisible && <aside className="trail">
            <div className="trail-head">
              <div className="t">
                <h3>Trail</h3>
                {streamState.isStreaming && <span className="trail-live">LIVE</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="icon-btn" title="Hide trail" onClick={() => setTrailVisible(false)}>×</button>
              </div>
            </div>
            <div className="trail-tabs">
              <button className={trailTab === 'now' ? 'active' : ''} onClick={() => setTrailTab('now')}>NOW</button>
              <button className={trailTab === 'timeline' ? 'active' : ''} onClick={() => setTrailTab('timeline')}>TIMELINE</button>
              <button className={trailTab === 'tools' ? 'active' : ''} onClick={() => setTrailTab('tools')}>TOOLS</button>
            </div>
            <div className="trail-body">

              {trailTab === 'now' && (
                <>
                  <div className="now-card">
                    <div className={`nc-label ${streamState.isStreaming ? 'running' : 'idle'}`}>
                      {streamState.isStreaming ? 'RUNNING' : 'IDLE'}
                    </div>
                    <div className="nc-title">{streamState.phase || 'Waiting for input'}</div>
                    {streamState.activityLog.length > 0 && (
                      <div className="nc-log">
                        {streamState.activityLog.slice(-6).map((item, i) => (
                          <div key={i} className="ln">
                            <span className="p">→</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-k">Tokens</div>
                      <div className="stat-v">{tokensToday > 0 ? tokensToday.toLocaleString() : '—'}<span className="unit">/ session</span></div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-k">Tool calls</div>
                      <div className="stat-v">{toolCallsSession}<span className="unit">/ session</span></div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-k">Messages</div>
                      <div className="stat-v">{messages.length}<span className="unit">total</span></div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-k">Status</div>
                      <div className="stat-v" style={{ fontSize: 14, color: online ? 'var(--good)' : online === false ? '#ef4444' : 'var(--ink-dim)' }}>
                        {online === null ? '…' : online ? 'online' : 'offline'}
                      </div>
                    </div>
                  </div>

                  <div className="mini-head">Connected</div>
                  <div className="conn-list">
                    <div className="eidon-conn"><span className="c-ico">◍</span><span style={{ flex: 1 }}>Browser</span><span className="c-perm">ASK</span><span className="c-dot" /></div>
                    <div className="eidon-conn"><span className="c-ico">◧</span><span style={{ flex: 1 }}>Filesystem</span><span className="c-perm">R/W</span><span className="c-dot" /></div>
                    <div className="eidon-conn"><span className="c-ico">▶</span><span style={{ flex: 1 }}>YouTube</span><span className="c-perm">OPEN</span><span className="c-dot" /></div>
                    <div className="eidon-conn"><span className="c-ico">{ }</span><span style={{ flex: 1 }}>System Apps</span><span className="c-perm">LAUNCH</span><span className="c-dot" /></div>
                  </div>
                </>
              )}

              {trailTab === 'timeline' && (
                <>
                  <div className="mini-head">Recent actions</div>
                  {trailToolCalls.length === 0 ? (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--ink-ghost)', padding: '8px 0' }}>
                      No tool calls yet
                    </div>
                  ) : (
                    <div className="tl-list">
                      {trailToolCalls.map((tc) => (
                        <div key={tc.id} className="tl-item">
                          <div className="tl-time">{formatTime(tc.msgTs)}</div>
                          <div>
                            <div className="tl-tool">{tc.tool}</div>
                            <div className="tl-meta">
                              <span className={tc.status === 'success' ? 'good' : tc.status === 'running' ? 'run' : ''}>
                                {tc.status}
                              </span>
                              {tc.latency != null && <span>{tc.latency < 1000 ? Math.round(tc.latency) + 'ms' : (tc.latency / 1000).toFixed(1) + 's'}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {trailTab === 'tools' && (
                <>
                  <div className="mini-head">Available tools</div>
                  <div className="tl-list">
                    {[
                      { name: 'open_app', desc: 'Opens a desktop application' },
                      { name: 'play_youtube', desc: 'Plays music or video' },
                      { name: 'open_site', desc: 'Opens a website URL' },
                      { name: 'set_reminder', desc: 'Set a timer or reminder' },
                      { name: 'list_reminders', desc: 'List active reminders' },
                      { name: 'web_search', desc: 'Search the web' },
                      { name: 'shell_exec', desc: 'Execute shell commands' },
                      { name: 'save_markdown_note', desc: 'Save a note to markdown' },
                    ].map(t => (
                      <div key={t.name} className="tl-item">
                        <div className="tl-time" style={{ paddingTop: 4 }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--fox)' }}>fn</span>
                        </div>
                        <div>
                          <div className="tl-tool">{t.name}</div>
                          <div className="tl-desc">{t.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

            </div>
          </aside>}
        </div>
      </div>

      {/* ── Tweaks panel ── */}
      {showTweaks && (
        <div
          style={{
            position: 'fixed', bottom: 100, left: 276, width: 240, zIndex: 1100,
            background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12,
            padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
            TWEAKS
          </div>

          {/* Accent */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--ink-dim)', marginBottom: 6 }}>Accent</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(ACCENTS).map(([name, val]) => (
                <button
                  key={name}
                  title={name}
                  onClick={() => setAccent(name)}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', border: accent === name ? '2px solid var(--ink)' : '2px solid transparent',
                    background: val, cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Density */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--ink-dim)', marginBottom: 6 }}>Density</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['cozy', 'normal', 'compact'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                    background: density === d ? 'rgba(255,120,40,0.15)' : 'transparent',
                    color: density === d ? 'var(--fox)' : 'var(--ink-dim)',
                    border: density === d ? '1px solid var(--fox)' : '1px solid var(--line)',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Trail panel', value: trailVisible, set: setTrailVisible },
              { label: 'Film grain', value: grainOn, set: setGrainOn },
            ].map(({ label, value, set }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>{label}</span>
                <button
                  onClick={() => set((v: boolean) => !v)}
                  style={{
                    position: 'relative', width: 32, height: 18, borderRadius: 999,
                    background: value ? 'var(--fox)' : 'var(--line)', border: 'none', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%',
                    background: 'white', transition: 'transform 0.2s', transform: value ? 'translateX(14px)' : 'translateX(0)',
                  }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Show trail button when hidden */}
      {!trailVisible && (
        <button
          onClick={() => setTrailVisible(true)}
          style={{
            position: 'fixed', bottom: 28, right: 32, padding: '6px 12px', borderRadius: 999,
            background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--ink-dim)',
            fontSize: 10, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        >
          Show Trail
        </button>
      )}

      {/* ── New Workflow modal ── */}
      {showNewWorkflow && <NewWorkflowModal onClose={() => setShowNewWorkflow(false)} />}

      {/* ── Settings modal ── */}
      {settingsOpen && (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="settings-modal-title">
              <span>Settings</span>
              <button className="settings-close" onClick={() => setSettingsOpen(false)}>
                <X size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                Close
              </button>
            </div>
            <SettingsPanel />
          </div>
        </div>
      )}
    </>
  );
}
